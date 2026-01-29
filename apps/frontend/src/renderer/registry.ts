import type { ComponentType, ReactNode } from 'react';

// Layout components
import { Column } from './components/layout/Column';
import { Row } from './components/layout/Row';
import { Grid } from './components/layout/Grid';
import { Card } from './components/layout/Card';

// Base components
import { Text } from './components/base/Text';
import { Image } from './components/base/Image';
import { Button } from './components/base/Button';
import { TextField } from './components/base/TextField';

// Domain components
import { MovieCard } from './components/domain/MovieCard';
import { TheaterCard } from './components/domain/TheaterCard';
import { DatePicker } from './components/domain/DatePicker';
import { TimePicker } from './components/domain/TimePicker';
import { SeatMap } from './components/domain/SeatMap';
import { SeatLegend } from './components/domain/SeatLegend';
import { ScreenIndicator } from './components/domain/ScreenIndicator';
import { TicketCounter } from './components/domain/TicketCounter';
import { ActionBar } from './components/domain/ActionBar';
import { ConfirmForm } from './components/domain/ConfirmForm';
import { BookingResult } from './components/domain/BookingResult';
import { BookingSummary } from './components/domain/BookingSummary';

export interface RendererComponentProps {
  children?: ReactNode;
  data?: unknown;
  onAction?: (actionName: string, data?: unknown) => void;
  [key: string]: unknown;
}

type RendererComponent = ComponentType<RendererComponentProps>;

const registry = new Map<string, RendererComponent>();

// Register layout components
registry.set('Column', Column as RendererComponent);
registry.set('Row', Row as RendererComponent);
registry.set('Grid', Grid as RendererComponent);
registry.set('Card', Card as RendererComponent);

// Register base components
registry.set('Text', Text as RendererComponent);
registry.set('Image', Image as RendererComponent);
registry.set('Button', Button as RendererComponent);
registry.set('TextField', TextField as RendererComponent);

// Register domain components
registry.set('MovieCard', MovieCard as RendererComponent);
registry.set('TheaterCard', TheaterCard as RendererComponent);
registry.set('DatePicker', DatePicker as RendererComponent);
registry.set('TimePicker', TimePicker as RendererComponent);
registry.set('SeatMap', SeatMap as RendererComponent);
registry.set('SeatLegend', SeatLegend as RendererComponent);
registry.set('ScreenIndicator', ScreenIndicator as RendererComponent);
registry.set('TicketCounter', TicketCounter as RendererComponent);
registry.set('ActionBar', ActionBar as RendererComponent);
registry.set('ConfirmForm', ConfirmForm as RendererComponent);
registry.set('BookingResult', BookingResult as RendererComponent);
registry.set('BookingSummary', BookingSummary as RendererComponent);

export function registerComponent(
  name: string,
  component: RendererComponent,
): void {
  registry.set(name, component);
}

export function getComponent(name: string): RendererComponent | undefined {
  return registry.get(name);
}
