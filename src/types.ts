/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FlightInfo {
  cutoff: string;
  origin?: string;
  dest: string;
  cto: string;
  etd: string;
  eta: string;
  airline?: string;
  days?: string;
  emailContacts?: string;
  contactPhone?: string;
  bookingPortal?: string;
  bookingNotes?: string;
}

export interface FlightSchedule {
  [flightCode: string]: FlightInfo;
}

export interface Shipment {
  id: number;
  cutoff: string;
  date: string; // Format: DDMMYYYY
  shipper: string;
  awb: string;
  flight: string;
  cto: string;
  uld: string;
  ice: string;
  dest: string;
  commodity: string;
  unitNum: string;
  specialInst: string;
  scr: string; // "YES", "NO", or ""
  operator: string;
  loadType: string; // "UNIT" or "LOOSE"
  jobRef: string;
  consolRef: string;
  eta: string;
  etd: string;
  complete: boolean;
  isDeleted?: boolean;
  confirmDelete?: boolean;
  deleteSured?: boolean;
  secondFlight?: string;
  ownerId?: string;
  workspaceId?: string;
  station?: string;
}
