/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlightSchedule, Shipment } from "../types";
import { julianToDate } from "../utils/helpers";

export const DEFAULT_SCHEDULE: FlightSchedule = {};

const RAW_SEED = [
  { id: 1, cutoff: "1900", date: "46023", shipper: "AUSSIE MEAT", awb: "203-00678160", flight: "5J050", cto: "MENZIES", uld: "3 X AKE", ice: "60", dest: "DXB", commodity: "CARCASES", unitNum: "AKE809435J AKE809515J", specialInst: "FOIL / ICE WOODWARD 10PM", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 2, cutoff: "0720", date: "46024", shipper: "LACTALIS PNS", awb: "081-61062035", flight: "QF029", cto: "QANTAS", uld: "1 X PMC", ice: "45", dest: "HKG", commodity: "DAIRY", unitNum: "PMC13511QF", specialInst: "FOIL / ICE / TEMP / 1006158843", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 3, cutoff: "1100", date: "46024", shipper: "LACTALIS DF", awb: "160-91070792", flight: "CX104", cto: "MENZIES", uld: "1X PMC 1X AKE", ice: "45 P/PMC", dest: "HKG", commodity: "CHILLED DAIRY", unitNum: "PMC24550R9 AKE92169CX", specialInst: "FOIL / ICE", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 4, cutoff: "1900", date: "46024", shipper: "LOBSTERWORLD", awb: "898-80446833", flight: "JD386", cto: "DNATA", uld: "2 X PMC", ice: "", dest: "HGH", commodity: "SALMON", unitNum: "PMC30463HU PMC35260JD", specialInst: "LABEL 731621 731622", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 5, cutoff: "0720", date: "46025", shipper: "LACTALIS PNS", awb: "081-61061825", flight: "QF029", cto: "QANTAS", uld: "1 X PMC", ice: "70", dest: "HKG", commodity: "DAIRY", unitNum: "PMC14271QF", specialInst: "FOIL / ICE / TEMP", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 6, cutoff: "1030", date: "46025", shipper: "THE SEEDS", awb: "232-15162943", flight: "MH148", cto: "MENZIES", uld: "1 X PMC", ice: "GEL PACKS", dest: "KUL", commodity: "SALAD MIX", unitNum: "PMC61690MH", specialInst: "GEL PACKS", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 7, cutoff: "1100", date: "46025", shipper: "COOLIBAH", awb: "160-91070840", flight: "CX104", cto: "MENZIES", uld: "1 X PMC", ice: "GP", dest: "HKG", commodity: "SALAD MIX", unitNum: "PMC57345R7", specialInst: "FOIL / GEL PACKS", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 8, cutoff: "1300", date: "46025", shipper: "AUSSIE MEAT", awb: "603-70482860", flight: "UL605", cto: "DNATA", uld: "2 x AKE", ice: "60", dest: "DXB", commodity: "CARCASES", unitNum: "AKE1969UL AKE1638UL", specialInst: "FOIL / ICE / SEAL", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 9, cutoff: "0500", date: "46026", shipper: "AMG", awb: "131-5214922", flight: "JL774", cto: "QANTAS", uld: "2 X PMC", ice: "90 P/PMC", dest: "NRT", commodity: "CHILLED MEAT", unitNum: "PMC30969JL PMC86160JL", specialInst: "FOIL / ICE", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 10, cutoff: "0900", date: "46027", shipper: "LACTALIS KAISER", awb: "081-61062072", flight: "QF035", cto: "QANTAS", uld: "3 X PMC", ice: "135", dest: "SIN", commodity: "DAIRY", unitNum: "PMC15348QF PMC41654QF", specialInst: "FOIL / ICE / TEMP", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 11, cutoff: "1400", date: "46027", shipper: "MURRAY COD", awb: "618-47455601", flight: "SQ208", cto: "QANTAS", uld: "8 LOOSE", ice: "", dest: "SGN", commodity: "CHILLED SEAFOOD", unitNum: "", specialInst: "", scr: "YES", operator: "", loadType: "LOOSE", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 12, cutoff: "0500", date: "46028", shipper: "AMG", awb: "131-35218374", flight: "JL774", cto: "QANTAS", uld: "1 X PAG", ice: "90", dest: "NRT", commodity: "CHILLED MEAT", unitNum: "PAG18489JL", specialInst: "FOIL/ICE", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 13, cutoff: "0900", date: "46028", shipper: "JEXBAY", awb: "081-60991825", flight: "QF035", cto: "QANTAS", uld: "2 X PMC", ice: "", dest: "SIN", commodity: "PRODUCE", unitNum: "PMC15001QF PMC14151QF", specialInst: "FOIL", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 14, cutoff: "1100", date: "46028", shipper: "COOLIBAH", awb: "160-91071013", flight: "CX104", cto: "MENZIES", uld: "2 x AKE", ice: "GP", dest: "HKG", commodity: "SALAD MIX", unitNum: "AKE92855CX AKE87727CX", specialInst: "FOIL / GEL PACKS", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 15, cutoff: "1300", date: "46028", shipper: "AUSSIE MEAT", awb: "603-70427593", flight: "UL605", cto: "DNATA", uld: "3 x AKE", ice: "90", dest: "DXB", commodity: "CARCASES", unitNum: "AKE1929UL AKE0711UL", specialInst: "FOIL / ICE", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 16, cutoff: "0500", date: "46029", shipper: "FAYMAN", awb: "131-35214874", flight: "JL774", cto: "QANTAS", uld: "1 X AKE", ice: "50", dest: "NRT", commodity: "FROZEN LAMB", unitNum: "AKE80978JL", specialInst: "FOIL/ICE", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 17, cutoff: "1220", date: "46029", shipper: "MURRAY COD", awb: "618-47455413", flight: "SQ228", cto: "QANTAS", uld: "7 CTNS LOOSE", ice: "", dest: "SIN", commodity: "CHILLED SEAFOOD", unitNum: "", specialInst: "", scr: "YES", operator: "", loadType: "LOOSE", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 18, cutoff: "1900", date: "46029", shipper: "LOBSTERWORLD", awb: "898-80446855", flight: "JD386", cto: "DNATA", uld: "2 X PMC", ice: "", dest: "HGH", commodity: "SALMON", unitNum: "PMC32652HU PMC30597HU", specialInst: "LABEL 732331 732332", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 19, cutoff: "0900", date: "46030", shipper: "KAISER", awb: "081-61062050", flight: "QF035", cto: "QANTAS", uld: "2X PMC 1X AKE", ice: "115", dest: "SIN", commodity: "CHILLED DAIRY", unitNum: "QKE11249QF PMC14526QF", specialInst: "FOIL / ICE / TEMP", scr: "YES", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
  { id: 20, cutoff: "0500", date: "46031", shipper: "AMG", awb: "131-35214933", flight: "JL774", cto: "QANTAS", uld: "2 X PMC", ice: "180", dest: "NRT", commodity: "CHILLED MEAT", unitNum: "PMC31134JL PMC86263JL", specialInst: "FOIL / ICE", scr: "NO", operator: "", loadType: "UNIT", jobRef: "", consolRef: "", eta: "", etd: "", complete: false },
];

export const SEED_DATA: Shipment[] = RAW_SEED.map((s) => ({
  ...s,
  date: julianToDate(s.date),
})) as unknown as Shipment[];
