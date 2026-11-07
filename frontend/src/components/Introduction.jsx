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
          Choose an outer hazard, such as an asteroid or a solar storm, or an inner failure, such as
          an oxygen leak or an engine fault. Then watch how the AI responds through live telemetry
          and its action log.
        </p>

        <h3>How to use it</h3>
        <ol>
          <li>Open the Generator tab.</li>
          <li>Pick a disaster and press Inject Disaster.</li>
          <li>Follow the ship in the 3D view and read the AI action log.</li>
        </ol>
        <p>There is no destination and no time limit, so you can keep testing the AI.</p>
      </div>

      <div className="intro-logo">
        <img src={logo} alt="Interstellar X⁴" />
      </div>
    </section>
  );
}
