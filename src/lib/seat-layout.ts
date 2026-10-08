/**
 * Sri Lankan Bus Seating Layout Generator
 * Supports authentic Sri Lankan bus seating topologies:
 * - 2x3 Normal / Semi Luxury Bus (e.g. 54 seats: 9 rows of 5 + rear door row + 6-seater rear bench)
 * - 2x2 Luxury Express (e.g. 45 seats: 10 rows of 4 + 5-seater rear bench)
 * - 2+1 VIP Sleeper / Luxury Single (e.g. 28 seats: 9 rows of 3 + 1 rear)
 */

export interface SeatCell {
  type: 'seat' | 'aisle' | 'empty';
  seatNumber?: number;
  seatId?: string;
  displayNumber?: string;
  seatCode?: 'W' | 'A' | 'M' | 'VIP' | 'C';
  label?: string;
  row: number;
  col: number;
  isRearDoor?: boolean;
}

export interface BusLayoutGrid {
  layoutType: '2x3' | '2x2' | '2+1';
  totalSeats: number;
  rows: number;
  cols: number;
  grid: SeatCell[][];
}

export function generateBusSeatGrid(
  rawLayoutType?: string,
  configuredSeats?: number,
  backRowType?: string
): BusLayoutGrid {
  const normType = (rawLayoutType || '2x2').toLowerCase().replace(':', 'x').replace('+', 'x');
  const is2x3 = normType === '2x3' || normType === '3x2';
  const is2x1 = normType === '2x1' || normType === '1x2';
  const layoutType: '2x3' | '2x2' | '2+1' = is2x3 ? '2x3' : is2x1 ? '2+1' : '2x2';

  const defaultSeats = is2x3 ? 54 : is2x1 ? 28 : 45;
  const totalSeats = Number(configuredSeats) > 0 ? Number(configuredSeats) : defaultSeats;

  if (is2x3) {
    // 2x3 Normal Bus (Ashok Leyland / SLTB / Semi-Luxury)
    // 6 visual columns: Col 0: LW, Col 1: LA, Col 2: Aisle, Col 3: RA, Col 4: RM, Col 5: RW
    const hasStandardRearDoor = (totalSeats - 9) % 5 === 0 && totalSeats >= 24;
    
    let rows: number;
    let doorRowIndex = -1;
    let rearBenchSeats = 0;

    if (hasStandardRearDoor) {
      const fullRows = (totalSeats - 9) / 5;
      rows = fullRows + 2;
      doorRowIndex = rows - 2; // Second to last row has passenger rear door
      rearBenchSeats = 6; // Last row has 6 seats across the back
    } else {
      rows = Math.ceil(totalSeats / 5);
    }

    const grid: SeatCell[][] = [];
    let currentSeat = 1;

    for (let r = 0; r < rows; r++) {
      const row: SeatCell[] = [];
      const isLastRow = (r === rows - 1);
      const isDoorRow = (r === doorRowIndex);

      for (let c = 0; c < 6; c++) {
        // Aisle column is c = 2
        if (c === 2) {
          if (isLastRow && rearBenchSeats === 6 && currentSeat <= totalSeats) {
            // Last row bench connects across the aisle
            const num = currentSeat++;
            row.push({
              type: 'seat',
              seatNumber: num,
              seatId: `S${num}`,
              displayNumber: String(num).padStart(2, '0'),
              seatCode: 'C',
              label: 'Rear Center Bench',
              row: r,
              col: c
            });
          } else {
            row.push({
              type: 'aisle',
              row: r,
              col: c
            });
          }
          continue;
        }

        // On door row: Left side (c = 0 and c = 1) is empty (passenger exit door / conductor space)
        if (isDoorRow && (c === 0 || c === 1)) {
          row.push({
            type: 'empty',
            isRearDoor: true,
            label: 'Rear Entrance Door',
            row: r,
            col: c
          });
          continue;
        }

        // Standard seat placement
        if (currentSeat <= totalSeats) {
          const num = currentSeat++;
          let seatCode: 'W' | 'A' | 'M' | 'C' = 'W';
          let label = 'Window Seat';

          if (c === 0) { seatCode = 'W'; label = 'Left Window Seat'; }
          else if (c === 1) { seatCode = 'A'; label = 'Left Aisle Seat'; }
          else if (c === 3) { seatCode = 'A'; label = 'Right Aisle Seat'; }
          else if (c === 4) { seatCode = 'M'; label = 'Right Middle Seat'; }
          else if (c === 5) { seatCode = 'W'; label = 'Right Window Seat'; }

          row.push({
            type: 'seat',
            seatNumber: num,
            seatId: `S${num}`,
            displayNumber: String(num).padStart(2, '0'),
            seatCode,
            label,
            row: r,
            col: c
          });
        } else {
          row.push({
            type: 'empty',
            row: r,
            col: c
          });
        }
      }
      grid.push(row);
    }

    return {
      layoutType: '2x3',
      totalSeats,
      rows,
      cols: 6,
      grid
    };
  } else if (layoutType === '2x2') {
    // 2x2 Luxury Express
    // 5 visual columns: Col 0: LW, Col 1: LA, Col 2: Aisle, Col 3: RA, Col 4: RW
    const hasBench = backRowType === '5-seater' || (backRowType !== '4-seater' && totalSeats % 4 === 1) || [41, 45, 49, 53].includes(totalSeats);
    
    let rows: number;
    if (hasBench) {
      rows = totalSeats <= 5 ? 1 : 1 + Math.ceil((totalSeats - 5) / 4);
    } else {
      rows = Math.ceil(totalSeats / 4);
    }

    const grid: SeatCell[][] = [];
    let currentSeat = 1;

    for (let r = 0; r < rows; r++) {
      const row: SeatCell[] = [];
      const isLastRow = (r === rows - 1);

      for (let c = 0; c < 5; c++) {
        if (c === 2) {
          if (isLastRow && hasBench && currentSeat <= totalSeats) {
            const num = currentSeat++;
            row.push({
              type: 'seat',
              seatNumber: num,
              seatId: `S${num}`,
              displayNumber: String(num).padStart(2, '0'),
              seatCode: 'C',
              label: 'Rear Center Bench',
              row: r,
              col: c
            });
          } else {
            row.push({
              type: 'aisle',
              row: r,
              col: c
            });
          }
          continue;
        }

        if (currentSeat <= totalSeats) {
          const num = currentSeat++;
          let seatCode: 'W' | 'A' = 'W';
          let label = 'Window Seat';

          if (c === 0) { seatCode = 'W'; label = 'Left Window Seat'; }
          else if (c === 1) { seatCode = 'A'; label = 'Left Aisle Seat'; }
          else if (c === 3) { seatCode = 'A'; label = 'Right Aisle Seat'; }
          else if (c === 4) { seatCode = 'W'; label = 'Right Window Seat'; }

          row.push({
            type: 'seat',
            seatNumber: num,
            seatId: `S${num}`,
            displayNumber: String(num).padStart(2, '0'),
            seatCode,
            label,
            row: r,
            col: c
          });
        } else {
          row.push({
            type: 'empty',
            row: r,
            col: c
          });
        }
      }
      grid.push(row);
    }

    return {
      layoutType: '2x2',
      totalSeats,
      rows,
      cols: 5,
      grid
    };
  } else {
    // 2+1 VIP Sleeper
    // 4 visual columns: Col 0: LW, Col 1: LA, Col 2: Aisle, Col 3: VIP Single
    const rows = Math.ceil(totalSeats / 3);
    const grid: SeatCell[][] = [];
    let currentSeat = 1;

    for (let r = 0; r < rows; r++) {
      const row: SeatCell[] = [];

      for (let c = 0; c < 4; c++) {
        if (c === 2) {
          row.push({
            type: 'aisle',
            row: r,
            col: c
          });
          continue;
        }

        if (currentSeat <= totalSeats) {
          const num = currentSeat++;
          let seatCode: 'W' | 'A' | 'VIP' = 'W';
          let label = 'Window Seat';

          if (c === 0) { seatCode = 'W'; label = 'Left Window Seat'; }
          else if (c === 1) { seatCode = 'A'; label = 'Left Aisle Seat'; }
          else if (c === 3) { seatCode = 'VIP'; label = 'VIP Single Sleeper'; }

          row.push({
            type: 'seat',
            seatNumber: num,
            seatId: `S${num}`,
            displayNumber: String(num).padStart(2, '0'),
            seatCode,
            label,
            row: r,
            col: c
          });
        } else {
          row.push({
            type: 'empty',
            row: r,
            col: c
          });
        }
      }
      grid.push(row);
    }

    return {
      layoutType: '2+1',
      totalSeats,
      rows,
      cols: 4,
      grid
    };
  }
}
