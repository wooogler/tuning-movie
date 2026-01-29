export function SeatLegend() {
  const items = [
    { color: 'bg-dark-lighter', label: 'Available' },
    { color: 'bg-primary', label: 'Selected' },
    { color: 'bg-dark-border', label: 'Occupied' },
    { color: 'bg-amber-600', label: 'Premium' },
    { color: 'bg-purple-600', label: 'Couple' },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-6">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${item.color}`} />
          <span className="text-sm text-gray-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
