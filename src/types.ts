export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json',
}

export interface PaginatedResult<T> {
  items: T[];
  next_page_token?: string;
  has_more: boolean;
  total_returned: number;
}
