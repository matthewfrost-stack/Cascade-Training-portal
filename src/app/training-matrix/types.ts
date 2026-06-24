export interface Staff {
  id: string;
  name: string;
  location_id: string;
}

export interface Course {
  id: string;
  name: string;
  category?: string;
  expiry_months?: number;
  never_expires?: boolean;
}

export interface MatrixCell {
  completion_date: string | null;
  expiry_date: string | null;
  training_id: string | null;
  status: string | null;
}

export interface RemovedCourseEntry {
  deleted_item_id: string;
  course_id: string;
  course_name: string;
  location_id: string;
  display_order: number;
}
