export type StackDisplayMode = "chips" | "bb";

function formatBigBlindValue(value: number) {
  const roundedInteger = Math.round(value);
  if (Math.abs(value - roundedInteger) < 0.001) {
    return `${roundedInteger}`;
  }

  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

export function formatAmountDisplay({
  amount,
  bigBlind,
  mode,
  includeUnit = true,
}: {
  amount: number;
  bigBlind: number;
  mode: StackDisplayMode;
  includeUnit?: boolean;
}) {
  if (mode === "bb" && bigBlind > 0) {
    const formatted = formatBigBlindValue(amount / bigBlind);
    return includeUnit ? `${formatted} BB` : formatted;
  }

  return `${amount}`;
}

export function formatAmountInputValue({
  amount,
  bigBlind,
  mode,
}: {
  amount: number;
  bigBlind: number;
  mode: StackDisplayMode;
}) {
  return formatAmountDisplay({ amount, bigBlind, mode, includeUnit: false });
}

export function parseAmountInputValue({
  value,
  bigBlind,
  mode,
}: {
  value: string;
  bigBlind: number;
  mode: StackDisplayMode;
}) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  if (mode === "bb") {
    if (!/^\d+(\.\d?)?$/.test(trimmedValue) || bigBlind <= 0) {
      return null;
    }

    const parsedBigBlinds = Number.parseFloat(trimmedValue);
    if (!Number.isFinite(parsedBigBlinds) || parsedBigBlinds <= 0) {
      return null;
    }

    return Math.max(1, Math.round(parsedBigBlinds * bigBlind));
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedAmount = Number.parseInt(trimmedValue, 10);
  return Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : null;
}

export function formatStackDisplay({
  stack,
  bigBlind,
  mode,
  includeUnit = true,
}: {
  stack: number;
  bigBlind: number;
  mode: StackDisplayMode;
  includeUnit?: boolean;
}) {
  return formatAmountDisplay({ amount: stack, bigBlind, mode, includeUnit });
}
