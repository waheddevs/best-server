import { Language, QuestionKind } from '@best/database';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('TeacherQuestionTranslation')
export class TeacherQuestionTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  prompt!: string;
  @Field(() => String, { nullable: true })
  rationale!: string | null;
}

@ObjectType('TeacherAnswerOptionTranslation')
export class TeacherAnswerOptionTranslationObject {
  @Field(() => Language)
  language!: Language;
  @Field(() => String)
  text!: string;
}

@ObjectType('TeacherAnswerOption')
export class TeacherAnswerOptionObject {
  @Field(() => ID)
  id!: string;
  @Field(() => Int)
  position!: number;
  @Field(() => Boolean)
  isCorrect!: boolean;
  @Field(() => [TeacherAnswerOptionTranslationObject])
  translations!: TeacherAnswerOptionTranslationObject[];
}

@ObjectType('TeacherTestQuestion')
export class TeacherTestQuestionObject {
  @Field(() => ID)
  id!: string;
  @Field(() => Int)
  position!: number;
  @Field(() => ID, { nullable: true })
  sectionId!: string | null;
  @Field(() => Int, { nullable: true })
  sectionPosition!: number | null;
  @Field(() => QuestionKind)
  kind!: QuestionKind;
  @Field(() => Int, { nullable: true })
  answerLimit!: number | null;
  @Field(() => Int, { nullable: true })
  maxSelections!: number | null;
  @Field(() => [String])
  acceptedAnswers!: string[];
  @Field(() => [TeacherQuestionTranslationObject])
  translations!: TeacherQuestionTranslationObject[];
  @Field(() => [TeacherAnswerOptionObject])
  options!: TeacherAnswerOptionObject[];
}
