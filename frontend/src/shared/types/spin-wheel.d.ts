declare module "spin-wheel" {
  export interface WheelItem {
    label?: string;
    backgroundColor?: string;
    labelColor?: string;
    weight?: number;
    value?: unknown;
    image?: HTMLImageElement;
  }

  export interface WheelProps {
    items?: WheelItem[];
    radius?: number;
    rotation?: number;
    rotationResistance?: number;
    rotationSpeedMax?: number;
    isInteractive?: boolean;
    lineWidth?: number;
    lineColor?: string;
    borderWidth?: number;
    borderColor?: string;
    itemBackgroundColors?: string[];
    itemLabelAlign?: "left" | "center" | "right";
    itemLabelBaselineOffset?: number;
    itemLabelColors?: string[];
    itemLabelFont?: string;
    itemLabelFontSizeMax?: number;
    itemLabelRadius?: number;
    itemLabelRadiusMax?: number;
    itemLabelRotation?: number;
    pointerAngle?: number;
    overlayImage?: HTMLImageElement;
    onRest?: (event: { currentIndex: number; rotation: number }) => void;
    onSpin?: (event: { method: string }) => void;
  }

  export class Wheel {
    constructor(container: Element, props?: WheelProps);
    init(props?: WheelProps): void;
    remove(): void;
    spin(rotationSpeed?: number): void;
    spinToItem(
      itemIndex?: number,
      duration?: number,
      spinToCenter?: boolean,
      numberOfRevolutions?: number,
      direction?: number,
      easingFunction?: (n: number) => number,
    ): void;
    stop(): void;
    onRest: ((event: { currentIndex: number; rotation: number }) => void) | null;
    rotation: number;
    rotationSpeed: number;
    items: WheelItem[];
  }
}
