// Shared fixtures for the X2 totals-reader suites (contract v1.0 §2 X2 / ADR-047).
//
// Every polygon here is COPIED from a real Azure prebuilt-invoice capture (api 2024-11-30,
// `unit: "inch"`) of two documents in the live corpus: a 1-page F&B receipt (LAI LOU MEI,
// page angle -1.31 deg) and page 2 of a 2-page consultancy invoice (BRIGHTPATH, +0.21 deg).
// Only geometry and totals figures are reproduced — those figures already appear in the
// Wave-B receipts under docs/plan/research — and identifying detail (addresses, the real SST
// registration) is sanitized or dropped. The raw captures stay OUT of the repo;
// `scripts/measure-invoice-id-capture.mjs --totals` runs the same reader against them locally.

export const line = (content, polygon) => ({ content, polygon });
export const onePage = (lines, pageNumber = 1, extra = {}) => [{ pageNumber, lines, ...extra }];
export const byPath = (fields) => Object.fromEntries(fields.map((f) => [f.field_path, f]));
// Labels sit at x~4.3-4.7 and right-aligned amounts at x~9.2-9.4; the receipt's skew puts
// each amount's top-left y 0.07-0.11in ABOVE its own label's, which is why the window is on
// |delta| and why the row test is box overlap rather than a shared baseline.
export const LAI_LOU_MEI = [
  line("SST Number : W10-2408-00000000", [5.2097, 3.4108, 8.7642, 3.1613, 8.7828, 3.4242, 5.2282, 3.6746]),
  line("INVOICE", [6.5144, 3.861, 7.3585, 3.7969, 7.3778, 4.0501, 6.5336, 4.1142]),
  line("11 SubTotal", [4.2849, 10.7628, 5.6325, 10.7236, 5.6405, 10.9989, 4.2929, 11.0381]),
  line("94.30", [9.2381, 10.6241, 9.891, 10.6134, 9.8953, 10.8778, 9.2424, 10.8884]),
  line("Service Charge@4%:", [4.6354, 11.0671, 6.8599, 10.9881, 6.8698, 11.2659, 4.6441, 11.3449]),
  line("3.77", [9.3868, 10.9297, 9.904, 10.921, 9.9084, 11.1856, 9.3913, 11.1943]),
  line("Service Tax@6%:", [4.6382, 11.37, 6.5022, 11.3085, 6.5112, 11.5818, 4.6472, 11.6433]),
  line("5.66", [9.4184, 11.2351, 9.9424, 11.2294, 9.9457, 11.4925, 9.4213, 11.4989]),
  line("Rounding Adj", [4.6405, 11.6722, 6.1412, 11.6311, 6.1488, 11.9098, 4.6481, 11.9503]),
  line("0.02", [9.4394, 11.544, 9.962, 11.5398, 9.964, 11.7938, 9.4414, 11.798]),
  line("Net Total", [4.6553, 11.9596, 6.8507, 11.8895, 6.8602, 12.1862, 4.6648, 12.2542]),
  line("103.75", [8.4781, 11.8575, 9.9649, 11.8374, 9.9693, 12.1113, 8.4824, 12.1327]),
  line("Tax Summary", [4.2865, 13.8624, 5.705, 13.8547, 5.7065, 14.1375, 4.288, 14.1452]),
  line("Taxable", [8.4077, 13.7859, 9.3394, 13.7695, 9.3444, 14.053, 8.4126, 14.0694]),
  line("Tax", [10.1108, 13.7509, 10.5315, 13.7499, 10.5322, 14.0162, 10.1114, 14.0172]),
  line("ervice Tax@6%", [4.3283, 14.1864, 6.097, 14.1581, 6.1016, 14.4482, 4.3329, 14.4689]),
  line("94.30", [8.5495, 14.1185, 9.2231, 14.1056, 9.2285, 14.3873, 8.5549, 14.3994]),
  line("5.66", [10.0044, 14.0753, 10.5366, 14.0694, 10.5404, 14.3455, 10.0082, 14.3528]),
];

// --- the real BRIGHTPATH totals block (measured, page 2) --------------------------------
// The face prints Rounding as "- 0.40" with the minus in its OWN narrow table column, and
// the Service Tax amount as a dash. OCR captured NEITHER glyph: no dash line, no dash word,
// and even the table cell for the tax comes back as "". So the fixture is faithful only if
// it omits them too.
export const BRIGHTPATH = [
  line("Ringgit Malaysia : Four Hundred Thirty Five Thousand Five", [0.7148, 8.2393, 4.153, 8.2494, 4.1525, 8.3954, 0.7143, 8.3886]),
  line("Sub Total (Excluding Tax)", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
  line("435,560.40", [7.105, 8.2704, 7.7038, 8.2739, 7.7031, 8.3954, 7.1043, 8.3921]),
  line("Hundred Sixty Only", [0.6803, 8.4063, 1.8293, 8.415, 1.8282, 8.5595, 0.6792, 8.5508]),
  line("Rounding", [6.313, 8.4327, 6.8735, 8.4366, 6.8727, 8.561, 6.3122, 8.557]),
  line("0.40", [7.4649, 8.441, 7.6985, 8.4406, 7.6987, 8.5521, 7.465, 8.5525]),
  line("Service Tax (8%)", [5.8782, 8.5907, 6.8636, 8.5971, 6.8628, 8.726, 5.8774, 8.7196]),
  line("Total (Inclusive of Tax)", [5.545, 8.7832, 6.8652, 8.7905, 6.8644, 8.9228, 5.5443, 8.9155]),
  line("435,560.00", [7.1032, 8.7961, 7.6987, 8.7976, 7.6984, 8.918, 7.103, 8.9166]),
  line("Notes :", [0.6782, 8.958, 1.0629, 8.9619, 1.0617, 9.0808, 0.6771, 9.077]),
];

// EZSEC — the corpus's only family printing a corroborable MYR breakdown (~45 bills), and the
// reason the vocabulary gained `total payable excl`. Label strings are VERBATIM from the runway
// measurement of EZSEC-IV-00721 (including the vendor's own "Rouding" typo); the geometry is
// the standard right-aligned A4 totals column, rows in the printed order.
//
// THE TRAP THIS FIXTURE EXISTS TO HOLD: the net and the gross are one letter apart
// (`Excl.` / `Incl.`) and, because this family charges 0.00 tax, they carry the SAME figure.
// A prefix that matched both would read the gross as the net and TIE — corroborating a wrong
// reading. That is why the Incl line is here, with its amount.
export const EZSEC = [
  line("Total Payable Excl. SST:", [4.5102, 6.1381, 6.3204, 6.1402, 6.3198, 6.2788, 4.5096, 6.2767]),
  line("1,700.00", [7.1043, 6.1409, 7.7038, 6.1421, 7.7031, 6.2761, 7.1036, 6.2749]),
  line("SST Amt @ 6%:", [4.5108, 6.2994, 5.6127, 6.3011, 5.6121, 6.4395, 4.5102, 6.4378]),
  line("0.00", [7.4102, 6.3018, 7.7041, 6.3026, 7.7035, 6.4362, 7.4096, 6.4354]),
  line("Rouding Adjustment:", [4.5111, 6.4208, 5.9803, 6.4227, 5.9797, 6.5611, 4.5105, 6.5592]),
  line("0.00", [7.4104, 6.4231, 7.7043, 6.4239, 7.7037, 6.5575, 7.4098, 6.5567]),
  line("Total Payable Incl. SST:", [4.5099, 6.6012, 6.3188, 6.6033, 6.3182, 6.7419, 4.5093, 6.7398]),
  line("1,700.00", [7.1041, 6.6039, 7.7036, 6.6051, 7.7029, 6.7391, 7.1034, 6.7379]),
];
