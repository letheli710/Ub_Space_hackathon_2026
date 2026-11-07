import { Orbit } from 'lucide-react';

export default function Introduction() {
  return (
    <section className="intro">
      <div className="intro-text">
        <h2>Welcome to ASTRACTRL</h2>
        <p>
          ASTRACTRL is a spacecraft simulator where you create the emergencies and an onboard AI
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
        <div className="intro-logo-mark">
          <Orbit size={150} strokeWidth={1.2} />
        </div>
        <b>
          ASTRA<span>CTRL</span>
        </b>
      </div>
    </section>
  );
}
