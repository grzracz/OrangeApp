type SliderProps = {
    id?: string;
    name?: string;
    value: number;
    min: number;
    max: number;
    ticker?: string;
    onChange?: (value: number) => void;
    decimals?: number;
    step: number;
};

function Slider({ id, name, value, onChange, min, max, ticker, decimals, step }: SliderProps) {
    return (
        <div className="flex flex-col items-center">
            <div className="block space-x-2 text-xs font-medium">
                <button
                    disabled={value <= min}
                    onClick={() => onChange && onChange(Math.max(min, value - step))}
                    className="bg-red-500 transition rounded shadow px-2 cursor-pointer py-1 hover:bg-red-600 text-white font-bold"
                >
                    -
                </button>{' '}
                <span>{name}</span>
                <button
                    disabled={value >= max}
                    onClick={() => onChange && onChange(Math.min(max, value + step))}
                    className="bg-red-500 transition rounded shadow px-2 cursor-pointer py-1 hover:bg-red-600 text-white font-bold"
                >
                    +
                </button>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs opacity-60 select-none pointer-events-none">
                    {(min || 0) / Math.pow(10, decimals || 0)}
                </span>
                <div>
                    <input
                        id={id}
                        type="range"
                        step={step}
                        min={min}
                        max={max}
                        value={value}
                        onChange={(event) => onChange && onChange(Number.parseInt(event?.target.value))}
                        className="w-full h-2 bg-orange-300 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <span className="text-xs opacity-60 select-none pointer-events-none">
                    {(max || 0) / Math.pow(10, decimals || 0)}
                </span>
            </div>
            <span className="font-bold heading">
                {(value || 0) / Math.pow(10, decimals || 0)} {ticker}
            </span>
        </div>
    );
}

export default Slider;
