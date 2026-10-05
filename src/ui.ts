/** Class names shared by the pop-up windows, so they all open and close the same way. */
export const backdropCls = (closing?: boolean): string =>
  `backdrop-anim${closing ? ' closing' : ''} fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4`;

export const sheetAnimCls = (closing?: boolean): string =>
  `sheet-anim${closing ? ' closing' : ''}`;
