import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run("starship_sim.api:create_app", factory=True,
                host="0.0.0.0", port=int(os.getenv("API_PORT", "8000")), workers=1)
