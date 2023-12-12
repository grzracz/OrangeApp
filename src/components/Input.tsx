type InputProps = {
    type?: string;
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
};

function Input({ type, placeholder, value, onChange }: InputProps) {
    return (
        <input
            type={type}
            placeholder={placeholder}
            onChange={(event) => onChange && onChange(event?.target.value || '')}
            value={value}
            className="bg-yellow-300 outline-0 heading hover:bg-yellow-400 shadow-lg border border-2 border-black transition-all px-4 py-2 text-xl rounded-lg"
        />
    );
}

export default Input;
