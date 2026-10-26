//! Synchronous, allocation-free batch of per-position tick arithmetic.
//! JS owns the bounded buffers; no threads, account state, I/O, or callbacks here.
use napi::{Error, Result, bindgen_prelude::Buffer};
use napi_derive::napi;

const INPUT_WIDTH: usize = 11;
const OUTPUT_WIDTH: usize = 4;
const STOP_LOSS: f64 = 1.0;
const TRAILING_STOP: f64 = 2.0;
const TAKE_PROFIT: f64 = 3.0;
const MARGIN_CALL: f64 = 4.0;

fn evaluate_row(row: &[f64], bid: f64, ask: f64, out: &mut [f64]) {
    let [
        side,
        size,
        entry,
        balance,
        peak,
        drawdown,
        fixed,
        trailing,
        target,
        anchor,
        margin_factor,
    ] = <[f64; INPUT_WIDTH]>::try_from(row).expect("validated row width");
    if side == 0.0 {
        out[0] = -1.0;
        return;
    }
    let long = side > 0.0;
    let exit = if long { bid } else { ask };
    let pnl = if long {
        (exit - entry) * size
    } else {
        (entry - exit) * size
    };
    let equity = balance + pnl;
    let new_peak = peak.max(equity);
    let new_drawdown = if new_peak > 0.0 {
        1.0_f64.min(drawdown.max((new_peak - equity) / new_peak))
    } else {
        drawdown
    };
    let trail_price = if long {
        anchor - trailing
    } else {
        anchor + trailing
    };
    let trail_tighter = fixed.is_nan()
        || if long {
            trail_price > fixed
        } else {
            trail_price < fixed
        };
    let use_trail = !trailing.is_nan() && trail_tighter;
    let stop = if use_trail { trail_price } else { fixed };
    let reason = if !stop.is_nan() && if long { exit <= stop } else { exit >= stop } {
        if use_trail { TRAILING_STOP } else { STOP_LOSS }
    } else if !target.is_nan() && if long { exit >= target } else { exit <= target } {
        TAKE_PROFIT
    } else if balance + pnl < 0.5 * (size * exit * margin_factor) {
        MARGIN_CALL
    } else {
        0.0
    };
    out[0] = reason;
    out[1] = new_peak;
    out[2] = new_drawdown;
    out[3] = if (long && exit > anchor) || (!long && exit < anchor) {
        exit
    } else {
        anchor
    };
}

#[napi]
pub fn abi_version() -> u32 {
    1
}

#[napi]
pub fn evaluate(
    mut input: Buffer,
    mut output: Buffer,
    count: u32,
    bid: f64,
    ask: f64,
) -> Result<()> {
    let n = count as usize;
    if n == 0
        || n > 5000
        || input.len() < n * INPUT_WIDTH * 8
        || output.len() < n * OUTPUT_WIDTH * 8
        || !bid.is_finite()
        || !ask.is_finite()
        || bid <= 0.0
        || ask < bid
    {
        return Err(Error::from_reason("invalid risk batch"));
    }
    // Typed arrays can alias in JS. Reject overlap before creating mutable slices.
    let from = input.as_ptr() as usize;
    let to = output.as_ptr() as usize;
    if from < to.saturating_add(output.len()) && to < from.saturating_add(input.len()) {
        return Err(Error::from_reason("risk buffers must not overlap"));
    }
    if !from.is_multiple_of(8) || !to.is_multiple_of(8) {
        return Err(Error::from_reason("risk buffers must be f64 aligned"));
    }
    // SAFETY: synchronous call with no JS re-entry or worker access; the engine supplies
    // private, non-shared ArrayBuffers. Overlapping input/output has been rejected above.
    let input = unsafe {
        std::slice::from_raw_parts_mut(input.as_mut_ptr().cast::<f64>(), n * INPUT_WIDTH)
    };
    let output = unsafe {
        std::slice::from_raw_parts_mut(output.as_mut_ptr().cast::<f64>(), n * OUTPUT_WIDTH)
    };
    for (row, out) in input
        .chunks_exact_mut(INPUT_WIDTH)
        .zip(output.chunks_exact_mut(OUTPUT_WIDTH))
    {
        evaluate_row(row, bid, ask, out);
        if row[0] != 0.0 {
            row[4] = out[1];
            row[5] = out[2];
            row[9] = out[3];
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protective_priority_and_trailing_anchor() {
        let mut row = [
            1.0,
            10.0,
            100.0,
            1000.0,
            1000.0,
            0.0,
            95.0,
            f64::NAN,
            110.0,
            100.0,
            0.05,
        ];
        let mut out = [0.0; OUTPUT_WIDTH];
        evaluate_row(&row, 94.0, 95.0, &mut out);
        assert_eq!(out[0], STOP_LOSS);
        row[6] = f64::NAN;
        row[7] = 2.0;
        evaluate_row(&row, 103.0, 104.0, &mut out);
        assert_eq!(out[0], 0.0);
        assert_eq!(out[3], 103.0);
        row[9] = out[3];
        evaluate_row(&row, 101.0, 102.0, &mut out);
        assert_eq!(out[0], TRAILING_STOP);
    }
}
