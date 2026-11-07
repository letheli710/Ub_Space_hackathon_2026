import json
from pathlib import Path
from starship_sim.api import create_app

if __name__ == "__main__":
    output = Path(__file__).resolve().parents[1] / "docs/openapi.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(create_app().openapi(), indent=2) + "\n", encoding="utf-8")
    print(f"Exported {output.name}")
