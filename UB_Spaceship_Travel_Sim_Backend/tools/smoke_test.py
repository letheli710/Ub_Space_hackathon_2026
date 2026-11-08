"""Exercise the real simulator through its public port; no ROS imports needed."""

import argparse
import json
import math
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from websockets.sync.client import connect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    def request(path, body=None):
        req = Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                      headers={"Content-Type": "application/json"} if body is not None else {})
        with urlopen(req, timeout=8) as response:
            return json.load(response)

    def eventually(predicate, timeout=30):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                result = predicate()
                if result:
                    return result
            except (HTTPError, URLError):
                pass
            time.sleep(0.2)
        raise AssertionError("Timed out waiting for live simulator state")

    eventually(lambda: request("/api/v1/state")["connection"]["ready"], timeout=120)
    scene = request("/api/v1/scene")
    assert scene["ship_entity_id"] in {entity["id"] for entity in scene["entities"]}
    state = request("/api/v1/state")
    assert state["connection"]["backend"] == "space_ros_gazebo"
    assert not state.get('ai_managed'), 'Manual smoke test requires AI_ENABLED=false'
    t0 = state["sim_time_s"]
    eventually(lambda: request("/api/v1/state")["sim_time_s"] > t0 + 0.5)
    start_distance = state["navigation"]["distance_m"]
    if not state["navigation"]["arrived"]:
        eventually(lambda: request("/api/v1/state")["navigation"]["distance_m"] < start_distance - 0.2)
    print("PASS: live clock, ship movement and scene geometry")

    orbiting = [item for item in scene.get("map", {}).get("objects", []) if "orbit" in item]
    def position(snapshot, name):
        return next(transform["position"] for transform in snapshot["transforms"] if transform["child_frame_id"] == name)

    if orbiting:
        sample = orbiting[0]
        name, orbit = sample["entity_id"], sample["orbit"]
        initial_speed = state["map"]["orbit_speed"]
        try:
            request("/api/v1/map/control", {"orbit_speed": 0})
            eventually(lambda: request("/api/v1/state")["map"]["orbit_speed"] == 0)
            time.sleep(.25)  # allow the command and final pose publication to arrive
            stopped = request("/api/v1/state")
            time.sleep(.5)
            later = request("/api/v1/state")
            assert later["sim_time_s"] > stopped["sim_time_s"] + .2
            assert math.dist(list(position(stopped, name).values()), list(position(later, name).values())) < .05
            request("/api/v1/map/control", {"orbit_speed": 2})
            time.sleep(.25)
            before = request("/api/v1/state")
            time.sleep(.7)
            after = request("/api/v1/state")
            a, b = position(before, name), position(after, name)
            center = orbit["center"]
            ax, ay = a["x"] - center["x"], a["y"] - center["y"]
            bx, by = b["x"] - center["x"], b["y"] - center["y"]
            measured_speed = math.atan2(ax * by - ay * bx, ax * bx + ay * by) / (after["sim_time_s"] - before["sim_time_s"])
            assert math.isclose(measured_speed, 2 * orbit["angular_speed_rad_s"], rel_tol=.25)
            assert math.isclose(math.hypot(bx, by), orbit["radius_m"], rel_tol=.001)
        finally:
            request("/api/v1/map/control", {"orbit_speed": initial_speed})
        print(f"PASS: {len(orbiting)} Gazebo orbits, measured orbital radius, and real 0x/2x map-speed control")

    try:
        request("/api/v1/simulation/control", {"paused": True})
        eventually(lambda: request("/api/v1/state")["paused"] is True)
        paused_time = request("/api/v1/state")["sim_time_s"]
        paused_state = request("/api/v1/state")
        time.sleep(0.5)
        assert abs(request("/api/v1/state")["sim_time_s"] - paused_time) < 0.02
        assert request("/api/v1/state")["connection"]["ready"]
        for item in orbiting:
            assert math.dist(list(position(paused_state, item["entity_id"]).values()),
                             list(position(request("/api/v1/state"), item["entity_id"]).values())) < .001
    finally:
        request("/api/v1/simulation/control", {"paused": False})
    eventually(lambda: request("/api/v1/state")["sim_time_s"] > paused_time + 0.2)
    print("PASS: pause and resume affect the Gazebo clock")

    targets = {}
    for arm in scene["arms"]:
        name, bounds = next(iter(arm["joints"].items()))
        target = max(bounds["lower_rad"], min(0.4, bounds["upper_rad"]))
        targets[arm["id"]] = (name, target)
        request(f'/api/v1/arms/{arm["id"]}/target', {"targets": {name: target}})
    eventually(lambda: all(abs(arm["measured_rad"][targets[arm["id"]][0]] - targets[arm["id"]][1]) < 0.08
                           for arm in request("/api/v1/state")["arms"]))
    print(f'PASS: {len(scene["arms"])} arms physically approach their requested joint targets')

    panel_targets = {}
    for panel in scene.get('solar_panels', []):
        target = max(panel['lower_rad'], min(.3, panel['upper_rad']))
        panel_targets[panel['id']] = target
        request(f'/api/v1/solar-panels/{panel["id"]}/target', {'target_rad': target})
    if panel_targets:
        eventually(lambda: all(abs(panel['measured_rad'] - panel_targets[panel['id']]) < .04
                              for panel in request('/api/v1/state')['solar_panels']))
        print(f'PASS: {len(panel_targets)} solar-panel hinges physically approach their requested targets')

    websocket_url = base.replace("https://", "wss://").replace("http://", "ws://") + "/api/v1/telemetry"
    with connect(websocket_url, open_timeout=5) as socket:
        message = json.loads(socket.recv(timeout=5))
        assert message["type"] == "state" and message["data"]["connection"]["ready"]
    print("PASS: WebSocket delivers live telemetry through the same port")


if __name__ == "__main__":
    main()
