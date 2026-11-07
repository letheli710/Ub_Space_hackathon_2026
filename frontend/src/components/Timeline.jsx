import { Activity } from 'lucide-react';

export default function Timeline({ logs, seconds }) {
  return (
    <div className="panel timeline">
      <div className="panelhead">
        <Activity size={18} /> AI ACTION LOG / EVENT TIMELINE
      </div>
      {logs.map((line, i) => (
        <div className="log" key={i}>
          <span>{String(Math.max(0, seconds - i * 2)).padStart(4, '0')}s</span>
          <span className="dot" />
          {line}
        </div>
      ))}
    </div>
  );
}
