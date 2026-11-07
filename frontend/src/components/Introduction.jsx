import logo from '../assets/interstellar-x4-logo.webp';

export default function Introduction() {
  return (
    <section className="intro">
      <div className="intro-text">
        <h2>Welcome to Interstellar X⁴</h2>
        <p>
          Interstellar X⁴ is a spacecraft simulator where you create the emergencies and an onboard AI
          handles them.
        </p>
        <p>
          The current environment connects to a simulated spaceship traveling toward a destination
          planet. Explore the ship, move its robotic arms, and follow measured telemetry.
          Disaster injection and autonomous AI responses are planned for a later stage.
        </p>

        <h3>How to use it</h3>
        <ol>
          <li>Open the Generator tab.</li>
          <li>Check that the simulator status reads LIVE.</li>
          <li>Select an arm, send a joint target, and watch its measured position.</li>
          <li>Use the pause button or explore the mission map.</li>
        </ol>
        <p>The ship approaches its destination automatically. The ship model and mission map can be replaced independently of this interface.</p>
      </div>

      <div className="intro-logo">
        <img src={logo} alt="Interstellar X⁴" />
      </div>
    </section>
  );
}
