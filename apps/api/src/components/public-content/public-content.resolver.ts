import { Language } from '@best/database';
import { Args, Query, Resolver } from '@nestjs/graphql';
import {
  PublicExamOfferingObject,
  PublicFaqItemObject,
  PublicResultVideoObject,
} from '../../schemas/public-content/public-content.object';
import { PublicContentService } from './public-content.service';

@Resolver()
export class PublicContentResolver {
  constructor(private readonly publicContentService: PublicContentService) {}

  @Query(() => [PublicFaqItemObject], { name: 'publicFaq' })
  faq(@Args('language', { type: () => Language }) language: Language) {
    return this.publicContentService.faq(language);
  }

  @Query(() => [PublicExamOfferingObject], {
    name: 'publicExamOfferings',
  })
  exams(@Args('language', { type: () => Language }) language: Language) {
    return this.publicContentService.exams(language);
  }

  @Query(() => [PublicResultVideoObject], { name: 'publicResultVideos' })
  results(@Args('language', { type: () => Language }) language: Language) {
    return this.publicContentService.results(language);
  }
}
