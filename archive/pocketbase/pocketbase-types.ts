/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Authorigins = "_authOrigins",
	Externalauths = "_externalAuths",
	Mfas = "_mfas",
	Otps = "_otps",
	Superusers = "_superusers",
	ActivityEvents = "activity_events",
	CommentLikes = "comment_likes",
	Comments = "comments",
	RouteGrades = "route_grades",
	RouteLogs = "route_logs",
	Routes = "routes",
	Sets = "sets",
	UserSetStats = "user_set_stats",
	Users = "users",
}

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export enum ActivityEventsTypeOptions {
	"completed" = "completed",
	"flashed" = "flashed",
	"beta_spray" = "beta_spray",
	"reply" = "reply",
}
export type ActivityEventsRecord = {
	created: IsoAutoDateString
	id: string
	route_id?: RecordIdString
	type: ActivityEventsTypeOptions
	updated: IsoAutoDateString
	user_id: RecordIdString
}

export type CommentLikesRecord = {
	comment_id: RecordIdString
	created: IsoAutoDateString
	id: string
	updated: IsoAutoDateString
	user_id: RecordIdString
}

export type CommentsRecord = {
	body: string
	created: IsoAutoDateString
	id: string
	likes?: number
	parent_id?: RecordIdString
	route_id: RecordIdString
	updated: IsoAutoDateString
	user_id: RecordIdString
}

export type RouteGradesRecord<Tcommunity_grade = unknown> = {
	community_grade?: null | Tcommunity_grade
	id: string
	route_id: RecordIdString
	vote_count?: number
}

export type RouteLogsRecord = {
	attempts?: number
	completed?: boolean
	completed_at?: IsoDateString
	created: IsoAutoDateString
	grade_vote?: number
	id: string
	route_id: RecordIdString
	updated: IsoAutoDateString
	user_id: RecordIdString
	zone?: boolean
}

export type RoutesRecord = {
	created: IsoAutoDateString
	has_zone?: boolean
	id: string
	number: number
	set_id: RecordIdString
	updated: IsoAutoDateString
}

export type SetsRecord = {
	active?: boolean
	created: IsoAutoDateString
	ends_at: IsoDateString
	id: string
	starts_at: IsoDateString
	updated: IsoAutoDateString
}

export type UserSetStatsRecord<Tcompletions = unknown, Tflashes = unknown, Tpoints = unknown> = {
	completions?: null | Tcompletions
	flashes?: null | Tflashes
	id: string
	points?: null | Tpoints
	set_id: RecordIdString
	user_id: RecordIdString
}

export type UsersRecord = {
	avatar?: FileNameString
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	onboarded?: boolean
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	username: string
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type ActivityEventsResponse<Texpand = unknown> = Required<ActivityEventsRecord> & BaseSystemFields<Texpand>
export type CommentLikesResponse<Texpand = unknown> = Required<CommentLikesRecord> & BaseSystemFields<Texpand>
export type CommentsResponse<Texpand = unknown> = Required<CommentsRecord> & BaseSystemFields<Texpand>
export type RouteGradesResponse<Tcommunity_grade = unknown, Texpand = unknown> = Required<RouteGradesRecord<Tcommunity_grade>> & BaseSystemFields<Texpand>
export type RouteLogsResponse<Texpand = unknown> = Required<RouteLogsRecord> & BaseSystemFields<Texpand>
export type RoutesResponse<Texpand = unknown> = Required<RoutesRecord> & BaseSystemFields<Texpand>
export type SetsResponse<Texpand = unknown> = Required<SetsRecord> & BaseSystemFields<Texpand>
export type UserSetStatsResponse<Tcompletions = unknown, Tflashes = unknown, Tpoints = unknown, Texpand = unknown> = Required<UserSetStatsRecord<Tcompletions, Tflashes, Tpoints>> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	activity_events: ActivityEventsRecord
	comment_likes: CommentLikesRecord
	comments: CommentsRecord
	route_grades: RouteGradesRecord
	route_logs: RouteLogsRecord
	routes: RoutesRecord
	sets: SetsRecord
	user_set_stats: UserSetStatsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	activity_events: ActivityEventsResponse
	comment_likes: CommentLikesResponse
	comments: CommentsResponse
	route_grades: RouteGradesResponse
	route_logs: RouteLogsResponse
	routes: RoutesResponse
	sets: SetsResponse
	user_set_stats: UserSetStatsResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase
