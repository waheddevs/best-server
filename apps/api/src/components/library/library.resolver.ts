import { Resolver } from '@nestjs/graphql';
import { LibraryService } from './library.service';

@Resolver()
export class LibraryResolver {
  constructor(private readonly libraryService: LibraryService) {}
}
