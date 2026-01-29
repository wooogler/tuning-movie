interface TextFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  onAction?: (actionName: string, data?: unknown) => void;
  action?: { type: string; event: string };
  data?: unknown;
}

export function TextField({
  label,
  value = '',
  placeholder = '',
  type = 'text',
  required = false,
  onAction,
  action,
}: TextFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (action && onAction) {
      onAction(action.event, e.target.value);
    }
  };

  return (
    <div className="mb-4">
      {label && (
        <label className="block text-sm text-gray-400 mb-2">{label}</label>
      )}
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        required={required}
        onChange={handleChange}
        className="w-full px-4 py-3 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
      />
    </div>
  );
}
