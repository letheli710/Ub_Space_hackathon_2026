"""Make a source-only Docker context without Windows/WSL extended attributes."""

from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ("Dockerfile", "requirements.lock", "starship_sim", "tools", "worlds", "config", "docker")


def main():
    output = ROOT / ".runtime/build-context.tar.gz"
    output.parent.mkdir(parents=True, exist_ok=True)

    def source_only(info):
        if "__pycache__" in Path(info.name).parts or info.name.endswith(".pyc"):
            return None
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        return info

    with tarfile.open(output, "w:gz", format=tarfile.USTAR_FORMAT) as archive:
        for source in SOURCES:
            archive.add(ROOT / source, arcname=source, filter=source_only)
    print("Packaged .runtime/build-context.tar.gz")


if __name__ == "__main__":
    main()
