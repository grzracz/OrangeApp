type SliderProps = {
    id?: string;
    name?: string;
    value?: number;
    min?: number;
    max?: number;
    ticker?: string;
    onChange?: (value: number) => void;
    decimals?: number;
    step?: number;
};

function Slider({ id, name, value, onChange, min, max, ticker, decimals, step }: SliderProps) {
    return (
        <div className="flex flex-col items-center">
            <label htmlFor={id} className="block text-xs font-medium">
                {name}
            </label>
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
