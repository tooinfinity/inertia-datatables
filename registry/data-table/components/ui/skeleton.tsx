import type { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export const Skeleton = ({ ...props }: SkeletonProps) => <div {...props} />;