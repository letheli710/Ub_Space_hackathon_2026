from copy import deepcopy

from fastapi.testclient import TestClient
import pytest
from starlette.websockets import WebSocketDisconnect

from starship_sim.api import create_app


class ContractBackend:
    """Explicit test double; never selected or imported by the running service."""
    def __init__(self):
        self.calls = []
        self.available = True
        self.closed = False

    def health(self):
        return {"backend": "contract_test", "ready": self.available, "online": self.available}

    def snapshot(self):
        return {"schema_version": 1, "sim_time_s": 12.5, "connection": self.health(),
                "arms": [{"id": "power", "measured_rad": {"yaw": 0.0}}]}

    def command_arm(self, arm_id, targets):
        if not self.available:
            raise RuntimeError("Gazebo telemetry is unavailable or stale")
        self.calls.append((arm_id, deepcopy(targets)))
        return {"status": "accepted", "arm_id": arm_id, "targets_rad": targets}

    async def control_world(self, paused):
        if not self.available:
            raise RuntimeError("Gazebo world-control service is unavailable")
        self.calls.append(("paused", paused))
        return {"status": "accepted", "requested_paused": paused}

    def close(self):
        self.closed = True


@pytest.fixture
def connected():
    backend = ContractBackend()
    with TestClient(create_app(backend=backend, origins=["http://localhost:5173"])) as client:
        yield client, backend
    assert backend.closed


def test_scene_and_state_are_available_for_web_clients(connected):
    client, _ = connected
    assert client.get("/readyz").status_code == 200
    assert len(client.get("/api/v1/scene").json()["arms"]) == 4
    assert client.get("/api/v1/state").json()["sim_time_s"] == 12.5
    assert "/api/v1/arms/{arm_id}/target" in client.get("/openapi.json").json()["paths"]


def test_arm_command_does_not_fabricate_measured_positions(connected):
    client, backend = connected
    response = client.post("/api/v1/arms/power/target", json={"targets": {"yaw": 0.4, "elbow": -0.3}})
    assert response.status_code == 202
    assert backend.calls == [("power", {"yaw": 0.4, "elbow": -0.3})]
    assert client.get("/api/v1/state").json()["arms"][0]["measured_rad"]["yaw"] == 0


@pytest.mark.parametrize("payload", [
    {"targets": {}}, {"targets": {"yaw": 20}},
    {"targets": {"yaw": 0.1, "unknown_joint": 0.2}},
    {"targets": {"yaw": 0.1}, "execute_code": "anything"},
])
def test_invalid_commands_publish_nothing(connected, payload):
    client, backend = connected
    assert client.post("/api/v1/arms/power/target", json=payload).status_code == 422
    assert backend.calls == []


def test_unknown_arm_and_nonfinite_angles_are_rejected(connected):
    client, backend = connected
    assert client.post("/api/v1/arms/unknown/target", json={"targets": {"yaw": 0}}).status_code == 404
    assert client.post("/api/v1/arms/power/target", content='{"targets":{"yaw":1e999}}',
                       headers={"Content-Type": "application/json"}).status_code == 422
    assert backend.calls == []


def test_disconnected_simulator_is_not_reported_ready(connected):
    client, backend = connected
    backend.available = False
    assert client.get("/healthz").status_code == 200
    assert client.get("/readyz").status_code == 503
    assert client.post("/api/v1/arms/power/target", json={"targets": {"yaw": 0}}).status_code == 503
    assert client.post("/api/v1/simulation/control", json={"paused": True}).status_code == 503


def test_pause_resume_contract(connected):
    client, backend = connected
    for paused in (True, False):
        response = client.post("/api/v1/simulation/control", json={"paused": paused})
        assert response.status_code == 200
        assert response.json()["requested_paused"] is paused
    assert backend.calls == [("paused", True), ("paused", False)]


def test_browser_cors_is_limited_to_configured_origins(connected):
    client, _ = connected
    response = client.get("/api/v1/state", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    response = client.get("/api/v1/state", headers={"Origin": "https://unconfigured.example"})
    assert "access-control-allow-origin" not in response.headers


def test_websocket_stream_and_origin_validation(connected):
    client, _ = connected
    with client.websocket_connect("/api/v1/telemetry", headers={"Origin": "http://localhost:5173"}) as socket:
        message = socket.receive_json()
        assert message["type"] == "state"
        assert message["data"]["sim_time_s"] == 12.5
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/v1/telemetry", headers={"Origin": "https://unconfigured.example"}):
            pass
