import { IntakeStatus, Language, UserRole } from '@best/database';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { ApiGraphqlContext } from '../../libs/types/authenticated-request.type';
import {
  AdminRemoveMessageInput,
  RegisterForEventInput,
  SetIntakeStatusInput,
  SetPublicEventStatusInput,
  SubmitContactRequestInput,
  SubmitExamRegistrationInput,
  UpdateEventInput,
  UpsertEventInput,
} from '../../schemas/events/event.input';
import {
  AdminIntakeConnectionObject,
  AdminIntakePayloadObject,
  PublicEventConnectionObject,
  PublicEventObject,
  PublicEventPayloadObject,
  PublicSubmissionReceiptObject,
} from '../../schemas/events/event.object';
import { AuthMember } from '../auth/decorators/auth-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventsService } from './events.service';
import { EventCoverService } from './event-cover.service';
import { MediaDownloadIntentObject } from '../../schemas/assets/media-download-intent.object';
@Resolver()
export class EventsResolver {
  constructor(
    private readonly service: EventsService,
    private readonly covers: EventCoverService,
  ) {}
  @Query(() => MediaDownloadIntentObject, { nullable: true })
  publicEventCover(@Args('eventId') eventId: string) {
    return this.covers.download(eventId);
  }

  @Query(() => MediaDownloadIntentObject, { nullable: true })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminEventCover(@Args('eventId') eventId: string) {
    return this.covers.download(eventId, true);
  }

  @Query(() => PublicEventConnectionObject, { name: 'publicEvents' }) list(
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ) {
    return this.service.list(language, first, after);
  }

  @Query(() => PublicEventObject, { name: 'publicEvent' }) one(
    @Args('slug') slug: string,
    @Args('language', { type: () => Language }) language: Language,
  ) {
    return this.service.one(slug, language);
  }
  @Query(() => PublicEventConnectionObject, { name: 'adminEvents' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminList(
    @Args('language', { type: () => Language }) language: Language,
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ) {
    return this.service.list(language, first, after, true);
  }
  @Query(() => PublicEventObject, { name: 'adminEvent' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminOne(
    @Args('slug') slug: string,
    @Args('language', { type: () => Language }) language: Language,
  ) {
    return this.service.one(slug, language, true);
  }
  @Mutation(() => PublicEventPayloadObject, { name: 'createEventDraft' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async create(
    @AuthMember('id') id: string,
    @Args('input') input: UpsertEventInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return { event: await this.service.create(id, input, ctx.req.requestId) };
  }
  @Mutation(() => PublicEventPayloadObject, { name: 'updateEventDraft' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @AuthMember('id') id: string,
    @Args('input') input: UpdateEventInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      event: await this.service.update(
        id,
        input.eventId,
        input,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => PublicEventPayloadObject, { name: 'setEventStatus' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async status(
    @AuthMember('id') id: string,
    @Args('input') input: SetPublicEventStatusInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      event: await this.service.setStatus(
        id,
        input.eventId,
        input.status,
        input.reason,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => PublicSubmissionReceiptObject, {
    name: 'submitContactRequest',
  })
  contact(@Args('input') input: SubmitContactRequestInput) {
    return this.service.contact(input);
  }
  @Mutation(() => PublicSubmissionReceiptObject, {
    name: 'submitExamRegistration',
  })
  exam(@Args('input') input: SubmitExamRegistrationInput) {
    return this.service.exam(input);
  }
  @Mutation(() => PublicSubmissionReceiptObject, { name: 'registerForEvent' })
  register(@Args('input') input: RegisterForEventInput) {
    return this.service.register(input);
  }
  @Query(() => AdminIntakeConnectionObject, { name: 'adminContactRequests' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  contacts(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => IntakeStatus })
    status?: IntakeStatus | null,
  ) {
    return this.service.intakeList('CONTACT', first, after, status);
  }
  @Query(() => AdminIntakeConnectionObject, { name: 'adminExamRegistrations' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  exams(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => IntakeStatus })
    status?: IntakeStatus | null,
  ) {
    return this.service.intakeList('EXAM', first, after, status);
  }
  @Query(() => AdminIntakeConnectionObject, { name: 'adminEventRegistrations' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  registrations(
    @Args('first', { nullable: true, type: () => Int }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true, type: () => IntakeStatus })
    status?: IntakeStatus | null,
  ) {
    return this.service.intakeList('EVENT', first, after, status);
  }
  @Mutation(() => ID, { name: 'adminRemoveMessage' })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeMessage(
    @AuthMember('id') id: string,
    @Args('input') input: AdminRemoveMessageInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return this.service.removeMessage(id, input.messageId, ctx.req.requestId);
  }
  @Mutation(() => AdminIntakePayloadObject, {
    name: 'adminSetContactRequestStatus',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async contactStatus(
    @AuthMember('id') id: string,
    @Args('input') input: SetIntakeStatusInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      intake: await this.service.setIntake(
        id,
        'CONTACT',
        input.intakeId,
        input.status,
        input.reviewNote,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => AdminIntakePayloadObject, {
    name: 'adminSetExamRegistrationStatus',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async examStatus(
    @AuthMember('id') id: string,
    @Args('input') input: SetIntakeStatusInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      intake: await this.service.setIntake(
        id,
        'EXAM',
        input.intakeId,
        input.status,
        input.reviewNote,
        ctx.req.requestId,
      ),
    };
  }
  @Mutation(() => AdminIntakePayloadObject, {
    name: 'adminSetEventRegistrationStatus',
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async eventStatus(
    @AuthMember('id') id: string,
    @Args('input') input: SetIntakeStatusInput,
    @Context() ctx: ApiGraphqlContext,
  ) {
    return {
      intake: await this.service.setIntake(
        id,
        'EVENT',
        input.intakeId,
        input.status,
        input.reviewNote,
        ctx.req.requestId,
      ),
    };
  }
}
