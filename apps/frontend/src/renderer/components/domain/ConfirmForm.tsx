interface ConfirmFormProps {
  onAction?: (actionName: string, data?: unknown) => void;
  data?: {
    customerName?: string;
    customerEmail?: string;
  };
}

export function ConfirmForm({ onAction, data }: ConfirmFormProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onAction?.('submit', {
      customerName: formData.get('customerName'),
      customerEmail: formData.get('customerEmail'),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-2">Name</label>
        <input
          type="text"
          name="customerName"
          defaultValue={data?.customerName || ''}
          required
          className="w-full px-4 py-3 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
          placeholder="Enter your name"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-2">Email</label>
        <input
          type="email"
          name="customerEmail"
          defaultValue={data?.customerEmail || ''}
          required
          className="w-full px-4 py-3 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
          placeholder="Enter your email"
        />
      </div>
      <button
        type="submit"
        className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors"
      >
        Confirm Booking
      </button>
    </form>
  );
}
