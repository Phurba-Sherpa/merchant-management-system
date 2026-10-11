import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../users/role.enum';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { RecordDecisionDto } from './dto/record-decision.dto';

@ApiTags('applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @Roles(Role.SALES, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new DRAFT merchant application' })
  @ApiCreatedResponse({ description: 'Application created successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async create(
    @Body() dto: CreateApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.create(dto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.REVIEWER, Role.SALES)
  @ApiOperation({ summary: 'List merchant applications' })
  @ApiOkResponse({ description: 'Paginated applications list' })
  async list(
    @Query() query: QueryApplicationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.list(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.REVIEWER, Role.SALES)
  @ApiOperation({ summary: 'Get application details' })
  @ApiOkResponse({ description: 'Application details' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.getOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.SALES, Role.ADMIN)
  @ApiOperation({
    summary: 'Partially update a DRAFT or NEEDS_INFO application',
  })
  @ApiOkResponse({ description: 'Application updated successfully' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  @ApiConflictResponse({ description: 'Application not editable' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.update(id, dto, user);
  }

  @Post(':id/submit')
  @Roles(Role.SALES, Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit application for risk review' })
  @ApiAcceptedResponse({ description: 'Application submitted for risk review' })
  @ApiConflictResponse({ description: 'Invalid state transition' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.submit(id, user);
  }

  @Post(':id/assign')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign a reviewer to the application (ADMIN only)',
  })
  @ApiOkResponse({ description: 'Reviewer assigned successfully' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  @ApiConflictResponse({ description: 'Application not in assignable state' })
  @ApiBadRequestResponse({ description: 'Reviewer not eligible' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.assign(id, dto, user);
  }

  @Post(':id/decisions')
  @Roles(Role.REVIEWER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record a review decision (Assigned REVIEWER only)',
  })
  @ApiCreatedResponse({ description: 'Decision recorded successfully' })
  @ApiForbiddenResponse({ description: 'Not assigned reviewer' })
  @ApiConflictResponse({ description: 'Invalid state transition' })
  @ApiBadRequestResponse({
    description: 'Comment required or validation error',
  })
  async recordDecision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.recordDecision(id, dto, user);
  }

  @Get(':id/decisions')
  @Roles(Role.ADMIN, Role.REVIEWER, Role.SALES)
  @ApiOperation({ summary: 'Get application decision history' })
  @ApiOkResponse({ description: 'Decision history' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  async getDecisions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.getDecisions(id, user);
  }
}
