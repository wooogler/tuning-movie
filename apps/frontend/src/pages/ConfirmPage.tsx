import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import type { Booking } from '../types';

export function ConfirmPage() {
  const navigate = useNavigate();
  const {
    movie,
    theater,
    date,
    showing,
    selectedSeats,
    tickets,
    customerName,
    customerEmail,
    setCustomerInfo,
    getTotalPrice,
    reset,
  } = useBookingStore();

  const [name, setName] = useState(customerName);
  const [email, setEmail] = useState(customerEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  if (!movie || !theater || !showing || selectedSeats.length === 0 || tickets.length === 0) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setCustomerInfo(name, email);
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.createBooking({
        showingId: showing.id,
        seats: selectedSeats.map((s) => s.id),
        tickets: tickets.map((t) => ({
          ticketTypeId: t.ticketType.id,
          quantity: t.quantity,
        })),
        customerName: name,
        customerEmail: email,
      });
      setBooking(result.booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewBooking = () => {
    reset();
    navigate('/');
  };

  if (booking) {
    return (
      <Layout title="Booking Confirmed" step={7}>
        <div className="max-w-lg mx-auto text-center">
          <div className="w-20 h-20 rounded-full bg-green-700 text-white text-4xl flex items-center justify-center mx-auto mb-6">
            ✓
          </div>
          <h3 className="text-xl font-semibold mb-2">Thank you for your booking!</h3>
          <p className="text-gray-400 mb-6">Booking ID: {booking.id}</p>

          <div className="bg-dark-light p-5 rounded-xl text-left mb-6">
            <p className="py-2 border-b border-dark-lighter">
              <strong>Movie:</strong> {movie.title}
            </p>
            <p className="py-2 border-b border-dark-lighter">
              <strong>Theater:</strong> {theater.name}
            </p>
            <p className="py-2 border-b border-dark-lighter">
              <strong>Date:</strong> {date}
            </p>
            <p className="py-2 border-b border-dark-lighter">
              <strong>Time:</strong> {showing.time}
            </p>
            <p className="py-2 border-b border-dark-lighter">
              <strong>Seats:</strong> {selectedSeats.map((s) => `${s.row}${s.number}`).join(', ')}
            </p>
            <p className="py-2">
              <strong>Total:</strong> ${booking.totalPrice.toFixed(2)}
            </p>
          </div>

          <p className="text-gray-400 mb-6">
            A confirmation email will be sent to <strong className="text-white">{email}</strong>
          </p>

          <button
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            onClick={handleNewBooking}
          >
            Book Another Movie
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Confirm Booking" step={7}>
      <div className="max-w-lg mx-auto">
        <div className="bg-dark-light p-6 rounded-xl mb-6">
          <h3 className="font-semibold mb-4">Booking Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-dark-lighter">
              <span>Movie:</span>
              <span>{movie.title}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-lighter">
              <span>Theater:</span>
              <span>{theater.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-lighter">
              <span>Date:</span>
              <span>{date}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-lighter">
              <span>Time:</span>
              <span>{showing.time}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-lighter">
              <span>Screen:</span>
              <span>{showing.screenNumber}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-lighter">
              <span>Seats:</span>
              <span>{selectedSeats.map((s) => `${s.row}${s.number}`).join(', ')}</span>
            </div>
          </div>

          <h4 className="font-semibold mt-6 mb-4 pt-4 border-t border-dark-border">Tickets</h4>
          <div className="space-y-2 text-sm">
            {tickets.map((t) => (
              <div key={t.ticketType.id} className="flex justify-between py-2 border-b border-dark-lighter">
                <span>
                  {t.ticketType.name} x {t.quantity}
                </span>
                <span>${(t.ticketType.price * t.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between py-4 text-lg font-bold border-t-2 border-dark-border">
              <span>Total:</span>
              <span>${getTotalPrice().toFixed(2)}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-dark-light p-6 rounded-xl">
          <h3 className="font-semibold mb-5">Customer Information</h3>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm text-gray-400 mb-2">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="email" className="block text-sm text-gray-400 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              className="w-full px-4 py-3 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
            />
          </div>

          {error && <p className="text-primary text-center mb-4">{error}</p>}

          <div className="flex justify-center gap-4">
            <button
              type="button"
              className="px-6 py-3 bg-dark-border text-white rounded-lg hover:bg-dark-lighter transition-colors"
              onClick={() => navigate('/tickets')}
            >
              Back
            </button>
            <button
              type="submit"
              className={`px-6 py-3 rounded-lg transition-colors
                ${
                  submitting || !name.trim() || !email.trim()
                    ? 'bg-primary/50 cursor-not-allowed'
                    : 'bg-primary hover:bg-primary-hover'
                }
              `}
              disabled={submitting || !name.trim() || !email.trim()}
            >
              {submitting ? 'Processing...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
