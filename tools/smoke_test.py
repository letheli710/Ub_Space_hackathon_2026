"""Exercise the real simulator through its public port; no ROS imports needed."""

import argparse
import json
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

    eventually(lambda: request("/readyz")["ready"], timeout=120)
    scene = request("/api/v1/scene")
    assert len(scene["arms"]) == 4
    state = request("/api/v1/state")
    assert state["connection"]["backend"] == "space_ros_gazebo"
    t0 = state["sim_time_s"]
    eventually(lambda: request("/api/v1/state")["sim_time_s"] > t0 + 0.5)
    start_x = next(t["position"]["x"] for t in state["transforms"] if t["child_frame_id"] == "starship")
    if not state["navigation"]["arrived"]:
        eventually(lambda: next(t["position"]["x"] for t in request("/api/v1/state")["transforms"]
                                if t["child_frame_id"] == "starship") > start_x + 0.2)
    print("PASS: live clock, ship movement and scene geometry")

    try:
        request("/api/v1/simulation/control", {"paused": True})
        eventually(lambda: request("/api/v1/state")["paused"] is True)
        paused_time = request("/api/v1/state")["sim_time_s"]
        time.sleep(0.5)
        assert abs(request("/api/v1/state")["sim_time_s"] - paused_time) < 0.02
        assert request("/readyz")["ready"]
    finally:
        request("/api/v1/simulation/control", {"paused": False})
    eventually(lambda: request("/api/v1/state")["sim_time_s"] > paused_time + 0.2)
    print("PASS: pause and resume affect the Gazebo clock")

    for arm in scene["arms"]:
        request(f'/api/v1/arms/{arm["id"]}/target', {"targets": {"yaw": 0.4}})
    eventually(lambda: all(abs(arm["measured_rad"]["yaw"] - 0.4) < 0.08
                           for arm in request("/api/v1/state")["arms"]))
    print("PASS: all four arm joints physically approach their requested targets")

    websocket_url = base.replace("https://", "wss://").replace("http://", "ws://") + "/api/v1/telemetry"
    with connect(websocket_url, open_timeout=5) as socket:
        message = json.loads(socket.recv(timeout=5))
        assert message["type"] == "state" and message["data"]["connection"]["ready"]
    print("PASS: WebSocket delivers live telemetry through the same port")


if __name__ == "__main__":
    main()
