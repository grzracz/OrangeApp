import { useEffect, useCallback, useLayoutEffect, useRef, useState } from 'react';
import * as React from 'react';
import { getColor } from 'views/Canvas';

type CanvasProps = {
    canvasWidth: number;
    canvasHeight: number;
    canvasData: { [key: string]: number[] };
    selectedColor: number;
    selectedPixel: { x: number; y: number } | null;
    setSelectedPixel: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
};

type Point = {
    x: number;
    y: number;
};

const ORIGIN = Object.freeze({ x: 0, y: 0 });

const { devicePixelRatio: ratio = 1 } = window;

function diffPoints(p1: Point, p2: Point) {
    return { x: p1.x - p2.x, y: p1.y - p2.y };
}

function addPoints(p1: Point, p2: Point) {
    return { x: p1.x + p2.x, y: p1.y + p2.y };
}

function scalePoint(p1: Point, scale: number) {
    return { x: p1.x / scale, y: p1.y / scale };
}

const MIN_SCALE = 0.8;
const MAX_SCALE = 10;
const ZOOM_SENSITIVITY = 500;

export default function Canvas(props: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
    const [scale, setScale] = useState<number>(1);
    const [offset, setOffset] = useState<Point>(ORIGIN);
    const [mousePos, setMousePos] = useState<Point>(ORIGIN);
    const [viewportTopLeft, setViewportTopLeft] = useState<Point>(ORIGIN);
    const isResetRef = useRef<boolean>(false);
    const lastMousePosRef = useRef<Point>(ORIGIN);
    const lastOffsetRef = useRef<Point>(ORIGIN);

    useEffect(() => {
        lastOffsetRef.current = offset;
    }, [offset]);

    const reset = useCallback(
        (context: CanvasRenderingContext2D) => {
            if (context && !isResetRef.current) {
                context.canvas.width = props.canvasWidth * ratio;
                context.canvas.height = props.canvasHeight * ratio;
                context.scale(ratio, ratio);
                setScale(1);

                setContext(context);
                setOffset(ORIGIN);
                setMousePos(ORIGIN);
                setViewportTopLeft(ORIGIN);
                lastOffsetRef.current = ORIGIN;
                lastMousePosRef.current = ORIGIN;

                isResetRef.current = true;
            }
        },
        [props.canvasWidth, props.canvasHeight],
    );

    const mouseMove = useCallback(
        (event: MouseEvent) => {
            if (context) {
                const lastMousePos = lastMousePosRef.current;
                const currentMousePos = { x: event.pageX, y: event.pageY }; // use document so can pan off element
                lastMousePosRef.current = currentMousePos;

                const mouseDiff = diffPoints(currentMousePos, lastMousePos);
                setOffset((prevOffset) => addPoints(prevOffset, mouseDiff));
            }
        },
        [context],
    );

    const mouseUp = useCallback(() => {
        document.removeEventListener('mousemove', mouseMove);
        document.removeEventListener('mouseup', mouseUp);
    }, [mouseMove]);

    const mouseClick = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            if (context) {
                const canvasRect = canvasRef.current?.getBoundingClientRect();
                if (canvasRect) {
                    const clickPos = {
                        x: (event.clientX - canvasRect.left) * ratio,
                        y: (event.clientY - canvasRect.top) * ratio,
                    };
                    const scaleClickPos = scalePoint(clickPos, scale);
                    const viewportClickPos = addPoints(scaleClickPos, viewportTopLeft);
                    const canvasClickPos = scalePoint(viewportClickPos, 1 / ratio);

                    const squareSize = Math.min(props.canvasHeight, props.canvasWidth) / 300;
                    const quadrantWidth = 90 * squareSize;
                    const yStart = props.canvasHeight / 2 - (quadrantWidth * 3) / 2;
                    const xStart = props.canvasWidth / 2 - (quadrantWidth * 3) / 2;

                    const x = Math.min(269, Math.max(0, Math.floor((canvasClickPos.x - xStart) / squareSize)));
                    const y = Math.min(269, Math.max(0, Math.floor((canvasClickPos.y - yStart) / squareSize)));

                    props.setSelectedPixel({ x, y });
                }
            }
        },
        [context, scale, viewportTopLeft, props.canvasWidth, props.canvasHeight],
    );

    const startPan = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            document.addEventListener('mousemove', mouseMove);
            document.addEventListener('mouseup', mouseUp);
            lastMousePosRef.current = { x: event.pageX, y: event.pageY };
        },
        [mouseMove, mouseUp],
    );

    useLayoutEffect(() => {
        if (canvasRef.current) {
            const renderCtx = canvasRef.current.getContext('2d');

            if (renderCtx) {
                reset(renderCtx);
            }
        }
    }, [reset, props.canvasHeight, props.canvasWidth]);

    useLayoutEffect(() => {
        if (context && lastOffsetRef.current) {
            const offsetDiff = scalePoint(diffPoints(offset, lastOffsetRef.current), scale);
            context.translate(offsetDiff.x, offsetDiff.y);
            setViewportTopLeft((prevVal) => diffPoints(prevVal, offsetDiff));
            isResetRef.current = false;
        }
    }, [context, offset, scale]);

    const drawQuadrant = (
        context: CanvasRenderingContext2D,
        i: number,
        j: number,
        squareSize: number,
        xStart: number,
        yStart: number,
        quadrantWidth: number,
    ) => {
        const yOffset = quadrantWidth * i;
        const xOffset = quadrantWidth * j;

        const data = props.canvasData[Buffer.from(new Uint8Array([i, j])).toString('base64')];
        if (data) {
            for (let y = 0; y < 90; y++) {
                for (let x = 0; x < 90; x++) {
                    const index = y * 90 + x;
                    context.fillStyle = getColor(data[index]);
                    context.fillRect(
                        xStart + xOffset + x * squareSize,
                        yStart + yOffset + y * squareSize,
                        squareSize,
                        squareSize,
                    );
                }
            }
        }
    };

    const drawCanvas = (context: CanvasRenderingContext2D, squareSize: number) => {
        const quadrantWidth = 90 * squareSize;
        const yStart = props.canvasHeight / 2 - (quadrantWidth * 3) / 2;
        const xStart = props.canvasWidth / 2 - (quadrantWidth * 3) / 2;
        context.fillStyle = `#000000`;
        context.fillRect(xStart - 1, yStart - 1, 3 * 90 * squareSize + 2, 1);
        context.fillRect(xStart - 1, yStart - 1, 1, 3 * 90 * squareSize + 2);
        context.fillRect(xStart - 1, yStart + 3 * 90 * squareSize, 3 * 90 * squareSize + 2, 1);
        context.fillRect(xStart + 3 * 90 * squareSize, yStart - 1, 1, 3 * 90 * squareSize + 2);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                drawQuadrant(context, i, j, squareSize, xStart, yStart, quadrantWidth);
            }
        }
        if (props.selectedPixel) {
            const { x, y } = props.selectedPixel;
            context.fillStyle = getColor(props.selectedColor);
            context.fillRect(xStart + x * squareSize, yStart + y * squareSize, squareSize, squareSize);
            context.strokeStyle = 'rgb(0, 0, 0)';
            context.setLineDash([0.33, 0.33]);
            context.lineWidth = 0.5;
            context.strokeRect(xStart + x * squareSize, yStart + y * squareSize, squareSize, squareSize);
        }
    };

    useLayoutEffect(() => {
        if (context) {
            const storedTransform = context.getTransform();
            context.canvas.width = context.canvas.width;
            context.setTransform(storedTransform);

            const squareSize = Math.min(props.canvasHeight, props.canvasWidth) / 300;
            drawCanvas(context, squareSize);
        }
    }, [
        props.canvasWidth,
        props.canvasHeight,
        context,
        scale,
        offset,
        viewportTopLeft,
        props.canvasData,
        props.selectedPixel,
        props.selectedColor,
    ]);

    useEffect(() => {
        const canvasElem = canvasRef.current;
        if (canvasElem === null) {
            return;
        }

        function handleUpdateMouse(event: MouseEvent) {
            event.preventDefault();
            if (canvasRef.current) {
                const viewportMousePos = { x: event.clientX, y: event.clientY };
                const topLeftCanvasPos = {
                    x: canvasRef.current.offsetLeft,
                    y: canvasRef.current.offsetTop,
                };
                setMousePos(diffPoints(viewportMousePos, topLeftCanvasPos));
            }
        }

        canvasElem.addEventListener('mousemove', handleUpdateMouse);
        canvasElem.addEventListener('wheel', handleUpdateMouse);
        return () => {
            canvasElem.removeEventListener('mousemove', handleUpdateMouse);
            canvasElem.removeEventListener('wheel', handleUpdateMouse);
        };
    }, []);

    useEffect(() => {
        const canvasElem = canvasRef.current;
        if (canvasElem === null) {
            return;
        }

        function handleWheel(event: WheelEvent) {
            event.preventDefault();
            if (context) {
                let zoom = 1 - event.deltaY / ZOOM_SENSITIVITY;
                const viewportTopLeftDelta = {
                    x: (mousePos.x / scale) * (1 - 1 / zoom),
                    y: (mousePos.y / scale) * (1 - 1 / zoom),
                };
                const newViewportTopLeft = addPoints(viewportTopLeft, viewportTopLeftDelta);

                const newScale = scale * zoom;
                if (newScale < MIN_SCALE || newScale > MAX_SCALE) {
                    return;
                }

                context.translate(viewportTopLeft.x, viewportTopLeft.y);
                context.scale(zoom, zoom);
                context.translate(-newViewportTopLeft.x, -newViewportTopLeft.y);

                setViewportTopLeft(newViewportTopLeft);
                setScale(scale * zoom);
                isResetRef.current = false;
            }
        }

        canvasElem.addEventListener('wheel', handleWheel);
        return () => canvasElem.removeEventListener('wheel', handleWheel);
    }, [context, mousePos.x, mousePos.y, viewportTopLeft, scale]);

    return (
        <canvas
            onMouseDown={startPan}
            onClick={mouseClick}
            ref={canvasRef}
            width={props.canvasWidth * ratio}
            height={props.canvasHeight * ratio}
            style={{
                width: `${props.canvasWidth}px`,
                height: `${props.canvasHeight}px`,
            }}
        ></canvas>
    );
}
