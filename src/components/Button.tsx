import { classNames } from 'utils';

type ButtonProps = {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    secondary?: boolean;
};

function Button({ children, onClick, disabled, secondary }: ButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={classNames(
                'heading shadow-lg border border-2 border-black transition-all px-4 py-2 text-2xl rounded-lg',
                disabled
                    ? 'bg-gray-600 cursor-not-allowed opacity-60'
                    : secondary
                    ? 'bg-red-400 hover:bg-red-500'
                    : 'bg-yellow-400 hover:bg-yellow-500',
            )}
        >
            {children}
        </button>
    );
}

export default Button;
