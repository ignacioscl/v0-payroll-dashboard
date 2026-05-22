export class PaginationDto<T> {
    constructor(values?: Partial<PaginationDto<T>>) {
      Object.assign(this, values)
    }
  
    data: T[] = [];
    page: number = 1;
    pageSize: number = 10;
    total: number = 0;
    lastPage: number = 1;
    next: string = '';
    previous: string = '';
    orderBy?: { value: string; order: 'ASC' | 'DESC' }[];
    includeDeleted?: 0 | 1;
    hasDeleted?: 0 | 1;
  


  }