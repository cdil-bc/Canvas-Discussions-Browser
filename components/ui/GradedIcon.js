/**
 * GradedIcon Component - Accessible checkmark icon
 * 
 * Indicates students who have been graded with semantic meaning.
 * Includes proper accessibility attributes for screen readers.
 */

export default function GradedIcon({ className = "w-4 h-4", ariaLabel = "Graded" }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
      aria-label={ariaLabel}
      role="img"
      aria-hidden="false"
    >
      <path 
        fillRule="evenodd" 
        d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" 
        clipRule="evenodd" 
      />
    </svg>
  );
}