export class StorageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = StorageInputError.name;
  }
}
