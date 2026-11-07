import { Activity } from 'lucide-react';

export default function Timeline({ logs }) {
  return (
    <div className="panel timeline">
      <div className="panelhead">
        <Activity size={18} /> SIMULATION EVENT TIMELINE
      </div>
      {logs.map(item => (
        <div className="log" key={item.id}>
          <span>{item.seconds == null ? '—' : `${item.seconds.toFixed(1)}s`}</span>
          <span className="dot" />
          {item.text}
        </div>
      ))}
    </div>
  );
}
