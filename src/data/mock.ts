import { Movie, Theater, Showing, Seat, TicketType, Booking } from '../types';

export const movies: Movie[] = [
  {
    id: 'm1',
    title: 'Dune: Part Two',
    posterUrl: 'https://example.com/dune2.jpg',
    genre: ['Sci-Fi', 'Action'],
    duration: 166,
    rating: 'PG-13',
    releaseDate: '2024-02-28'
  },
  {
    id: 'm2',
    title: 'Oppenheimer',
    posterUrl: 'https://example.com/oppenheimer.jpg',
    genre: ['Drama', 'History'],
    duration: 180,
    rating: 'R',
    releaseDate: '2023-08-15'
  },
  {
    id: 'm3',
    title: 'The Holdovers',
    posterUrl: 'https://example.com/holdovers.jpg',
    genre: ['Comedy', 'Drama'],
    duration: 134,
    rating: 'R',
    releaseDate: '2024-01-05'
  }
];

export const theaters: Theater[] = [
  {
    id: 't1',
    name: 'AMC Lincoln Square',
    location: 'New York, NY',
    screenCount: 12
  },
  {
    id: 't2',
    name: 'Regal LA Live',
    location: 'Los Angeles, CA',
    screenCount: 10
  },
  {
    id: 't3',
    name: 'Alamo Drafthouse',
    location: 'Austin, TX',
    screenCount: 15
  }
];

export const showings: Showing[] = [
  {
    id: 's1',
    movieId: 'm1',
    theaterId: 't1',
    screenNumber: 1,
    date: '2024-03-15',
    time: '10:00',
    availableSeats: 80,
    totalSeats: 100
  },
  {
    id: 's2',
    movieId: 'm1',
    theaterId: 't1',
    screenNumber: 1,
    date: '2024-03-15',
    time: '14:00',
    availableSeats: 95,
    totalSeats: 100
  },
  {
    id: 's3',
    movieId: 'm1',
    theaterId: 't2',
    screenNumber: 2,
    date: '2024-03-15',
    time: '11:00',
    availableSeats: 70,
    totalSeats: 80
  },
  {
    id: 's4',
    movieId: 'm2',
    theaterId: 't1',
    screenNumber: 2,
    date: '2024-03-15',
    time: '13:00',
    availableSeats: 60,
    totalSeats: 100
  },
  {
    id: 's5',
    movieId: 'm3',
    theaterId: 't3',
    screenNumber: 1,
    date: '2024-03-16',
    time: '15:00',
    availableSeats: 120,
    totalSeats: 150
  }
];

const generateSeats = (showingId: string, totalSeats: number): Seat[] => {
  const seats: Seat[] = [];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const seatsPerRow = Math.ceil(totalSeats / rows.length);

  for (let i = 0; i < rows.length; i++) {
    for (let j = 1; j <= seatsPerRow; j++) {
      if (seats.length >= totalSeats) break;

      const isOccupied = Math.random() < 0.2;
      seats.push({
        id: `${showingId}-${rows[i]}${j}`,
        showingId,
        row: rows[i],
        number: j,
        type: i >= 6 ? 'premium' : j % 2 === 0 && j < seatsPerRow - 1 ? 'couple' : 'standard',
        status: isOccupied ? 'occupied' : 'available'
      });
    }
  }

  return seats;
};

export const seats: Record<string, Seat[]> = {
  s1: generateSeats('s1', 100),
  s2: generateSeats('s2', 100),
  s3: generateSeats('s3', 80),
  s4: generateSeats('s4', 100),
  s5: generateSeats('s5', 150)
};

export const ticketTypes: TicketType[] = [
  {
    id: 'tt1',
    name: 'Adult',
    price: 14.00,
    description: 'Ages 18+'
  },
  {
    id: 'tt2',
    name: 'Child',
    price: 9.00,
    description: 'Ages 3-12'
  },
  {
    id: 'tt3',
    name: 'Senior',
    price: 10.00,
    description: 'Ages 65+'
  }
];

export const bookings: Booking[] = [];
