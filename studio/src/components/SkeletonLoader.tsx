import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'

const skeletonStyles = css`
  height: 20px;
  background: linear-gradient(
    90deg,
    ${palette.gray.light2} 25%,
    ${palette.gray.light3} 50%,
    ${palette.gray.light2} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin: 8px 12px;

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
`

interface SkeletonLoaderProps {
  count?: number
  height?: number
}

export function SkeletonLoader({ count = 1, height = 20 }: SkeletonLoaderProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={skeletonStyles}
          style={{ height }}
        />
      ))}
    </>
  )
}
