# Sticker cut-line proof verification

This runbook records the one physical check that proves the exported sticker
artwork and cut paths stay aligned on a real printer and cutting machine. The
generator is deterministic and fail-closed, but the results below must be
filled in by hand after printing, importing into Design Space, and cutting
vinyl.

## Generate the proof sheet

Run this from the repository root:

```bash
pnpm --filter @workspace/scripts run proof:cutline
```

The command creates:

- `proof/cutline-proof-print.png` — a US Letter sheet at 300 DPI, exactly
  2550 × 3300 pixels. It contains the calibration square, four rasterized
  stickers, and the expected width printed below each sticker.
- `proof/cutline-proof-cut.svg` — a cut-only SVG with a 215.9 × 279.4 mm page
  and the same 300-DPI coordinate origin as the PNG. It contains no labels,
  calibration square, or raster images.

The generator runs the four fixture rasters through the real sized sticker
pipeline before tracing their cut paths. It rejects incorrect page dimensions,
subpath counts, hole winding, edge clearance, calibration-square overlap, and
cut widths outside the declared ±0.4 mm tolerance. Do not use output from a
run that exits non-zero.

## Physical procedure

1. Open `proof/cutline-proof-print.png` and print it at **100% / actual size**.
   Turn scaling, fit-to-page, shrink-to-fit, and borderless expansion off.
2. Measure the filled black square labelled `50.0 mm` with a ruler or
   calipers. If it is not **50.0 mm ±0.5 mm**, stop and correct the printer
   settings before doing anything else.
3. Confirm the four printed labels match the expected widths:
   `plain.svg · 38.0 mm`, `bordered.svg · 38.0 mm`,
   `two-part.svg · 60.0 mm`, and `holed.svg · 38.0 mm`.
4. Upload `proof/cutline-proof-cut.svg` to Cricut Design Space or the target
   cutting software as an SVG cut file. Record whether it imports without
   manual intervention and whether the hole in `holed.svg` appears as an
   interior cut rather than a filled area.
5. Place the printed sheet on the cutting mat using the same top-left origin
   as the imported cut file. Cut on vinyl with the machine settings used for
   normal seller output.
6. Measure each completed sticker. Record any blade offset greater than
   0.5 mm, the two-part artwork cutting as one shape instead of two, the hole
   failing to cut, the bordered sticker cutting on the art instead of its
   2 mm border, or any width more than 0.5 mm from the expected value.

## Run record

- Date:
- Machine / software:
- Blade:
- Material:
- Printer:
- Operator:
- Generator commit:

## Results

Leave this table empty until the physical run is complete.

| Fixture | Expected width | Measured width | Subpaths expected | Subpaths cut | Pass / fail | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `plain.svg` | 38.0 mm |  | 1 |  |  |  |
| `bordered.svg` | 38.0 mm |  | 1 |  |  |  |
| `two-part.svg` | 60.0 mm |  | 2 |  |  |  |
| `holed.svg` | 38.0 mm |  | 2 (1 outer + 1 hole) |  |  |  |

## Acceptance criteria

- The calibration square measures 50.0 mm ±0.5 mm at print time.
- The SVG imports as a cut file without manual cleanup.
- The `holed.svg` interior is cut as a hole.
- The two-part fixture produces two separate cuts.
- The bordered fixture follows the 2 mm border rather than the source page
  edge or the inner artwork.
- No cut path is offset by more than 0.5 mm and all measured widths are within
  0.5 mm of their expected values.

The results table is intentionally not pre-filled by the software. The
physical machine check is the deliverable this record is designed to capture.