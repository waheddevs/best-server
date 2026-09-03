import { Field, ObjectType } from '@nestjs/graphql';

import { PageInfoObject } from '../pagination/page-info.object';
import {
  StudentLibraryItemObject,
  TeacherLibraryItemObject,
} from './library-item.object';

@ObjectType('TeacherLibraryItemEdge')
export class TeacherLibraryItemEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => TeacherLibraryItemObject)
  node!: TeacherLibraryItemObject;
}

@ObjectType('TeacherLibraryItemConnection')
export class TeacherLibraryItemConnectionObject {
  @Field(() => [TeacherLibraryItemEdgeObject])
  edges!: TeacherLibraryItemEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}

@ObjectType('StudentLibraryItemEdge')
export class StudentLibraryItemEdgeObject {
  @Field(() => String)
  cursor!: string;

  @Field(() => StudentLibraryItemObject)
  node!: StudentLibraryItemObject;
}

@ObjectType('StudentLibraryItemConnection')
export class StudentLibraryItemConnectionObject {
  @Field(() => [StudentLibraryItemEdgeObject])
  edges!: StudentLibraryItemEdgeObject[];

  @Field(() => PageInfoObject)
  pageInfo!: PageInfoObject;
}
