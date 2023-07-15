import { memo } from 'react';
import { Computed } from './Computed';

export const Memo = memo(Computed, () => true);
