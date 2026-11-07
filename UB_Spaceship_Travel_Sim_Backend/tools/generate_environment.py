"""Generate Gazebo, browser and ROS assets from config/environment.json."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from starship_sim.environment import build_environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    profile = json.loads((ROOT / "config/environment.json").read_text(encoding="utf-8"))
    for name, content in build_environment(ROOT, profile).items():
        path = ROOT / name
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                raise SystemExit(f"Regenerate {name}: python tools/generate_environment.py")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    print("Environment assets are consistent." if args.check else "Generated environment, scene and bridge.")


if __name__ == "__main__":
    main()
