
'use client';
import { MatrixProvider } from './context/MatrixContext';
import { MatrixLayout } from './components/MatrixLayout';

export default function TrainingMatrixPage() {
  return (
    <MatrixProvider>
      <MatrixLayout />
    </MatrixProvider>
  );
}
