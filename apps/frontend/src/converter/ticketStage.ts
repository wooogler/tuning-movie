import type { TicketType } from '../types';
import type { UISpec } from './types';

interface TicketSelection {
  ticketType: TicketType;
  quantity: number;
}

export function convertTicketStage(
  ticketTypes: TicketType[],
  selectedSeatCount: number,
  tickets: TicketSelection[],
): UISpec {
  const totalTickets = tickets.reduce((sum, t) => sum + t.quantity, 0);
  const totalPrice = tickets.reduce(
    (sum, t) => sum + t.ticketType.price * t.quantity,
    0,
  );
  const isValid = totalTickets === selectedSeatCount;

  // Create ticket quantities map
  const ticketQuantities: Record<string, number> = {};
  tickets.forEach((t) => {
    ticketQuantities[t.ticketType.id] = t.quantity;
  });

  return {
    surface: 'ticket_select',
    components: [
      {
        id: 'root',
        type: 'Column',
        children: ['ticket_list', 'summary', 'actions'],
        props: { align: 'stretch', gap: 6 },
      },
      {
        id: 'ticket_list',
        type: 'Column',
        children: ticketTypes.map((_, i) => `ticket_${i}`),
        props: { gap: 3 },
      },
      ...ticketTypes.map((ticketType, i) => ({
        id: `ticket_${i}`,
        type: 'TicketCounter',
        data: { path: `/ticketTypes/${i}` },
        props: {
          quantity: ticketQuantities[ticketType.id] || 0,
        },
      })),
      {
        id: 'summary',
        type: 'Column',
        children: ['summary_text'],
        props: { align: 'center', gap: 2 },
      },
      {
        id: 'summary_text',
        type: 'Text',
        props: {
          variant: 'body',
          text: `${totalTickets}/${selectedSeatCount} tickets selected · $${totalPrice.toLocaleString()}`,
          className: isValid ? 'text-green-500' : 'text-yellow-500',
        },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/seats', label: 'Back' },
          next: {
            to: '/confirm',
            label: 'Continue',
            disabled: !isValid,
          },
        },
      },
    ],
    dataModel: { ticketTypes, ticketQuantities },
    state: {
      tickets,
      totalTickets,
      totalPrice,
    },
    actions: {
      incrementTicket: { type: 'setState', payload: { target: 'tickets' } },
      decrementTicket: { type: 'setState', payload: { target: 'tickets' } },
    },
  };
}
