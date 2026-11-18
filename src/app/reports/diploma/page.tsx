import { redirect } from 'next/navigation';

/** The Level 3 Diploma tracker now lives on the NVQ & Diploma Tracker page. */
export default function DiplomaRedirect() {
  redirect('/apps/nvq-diploma?tab=level3');
}
