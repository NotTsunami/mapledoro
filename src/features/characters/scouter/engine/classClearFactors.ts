/*
  How much better (or worse) a class clears bosses than MapleScouter's figures predict, from real
  GMS solo clears: the time a clear actually took against the Boss Clear % MapleScouter gave that
  character. The local engine multiplies the class's damage by it before turning damage into HEXA
  and Boss Clear %, so a factor of 1.3 shows the HEXA of a sheet that deals 30% more damage.

  Only classes whose clears agree closely are listed. Every other class uses MapleScouter's figures
  unchanged. Values are the median of close clears (little time left) uploaded since the last
  MapleScouter cut update and each class's and boss's latest rework, rounded down, so the
  estimate leans toward needing slightly more than the real minimum. The clear log and method are
  kept in MapleDoro's separate boss-clears dataset.
*/

export const CLASS_CLEAR_FACTOR: Readonly<Partial<Record<string, number>>> = {
  // 8 close clears, 1.03 to 1.64, median 1.32.
  kanna: 1.3,
  // 10 close clears, 0.97 to 1.19, median 1.09 (1.13 on the 6 since August).
  mo_xuan: 1.1,
};
