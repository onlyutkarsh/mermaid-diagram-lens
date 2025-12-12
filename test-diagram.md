# Mermaid Preview Test File

Test the extension with these sample diagrams!

## Flowchart Example

```mermaid
---
config:
  layout: elk
  elk:
    mergeEdges: false
    nodePlacementStrategy: LINEAR_SEGMENTS
---
erDiagram
    ClipType ||--o{ Clip : "defines clip category | ClipType.Id -> Clip.ClipTypeId"
    ClipType {
        int Id PK "Identity primary key"
        varchar(30) Name "Clip type [Static: 1=Name, 2=Question]"
    }
   
    KeyingAgencyType ||--o{ KeyingAgency : "categorizes keying workflow | KeyingAgencyType.Id -> KeyingAgency.KeyingAgencyTypeId"
    KeyingAgencyType {
        int Id PK "Identity primary key"
        varchar(100) Name "Keying stage [Static: 1=Name, 2=Question, 3=AI]"
    }
   
    KeyingAgency ||--o{ ZipFile : "receives zip files | KeyingAgency.Id -> ZipFile.KeyingAgencyId"
    KeyingAgency ||--o{ KeyedDataIngestion : "provides keyed data | KeyingAgency.AgencyCode -> KeyedDataIngestion.KeyingAgencyCode"
    KeyingAgency {
        int Id PK "Identity primary key"
        varchar(50) AgencyCode UK "Agency identifier (e.g., AA0097) from DI API [UX_KeyingAgency_AgencyCode]"
        varchar(50) Name "Agency display name"
        bit IsEnabled "Active status flag"
        int KeyingAgencyTypeId FK "Keying stage: Name/Question/AI"
    }
   
    ZipFileStatus ||--o{ ZipFile : "tracks import status | ZipFileImportStatus.Id -> ZipFile.FileImportStatusId"
    ZipFileStatus {
        int Id PK "Identity primary key"
        varchar(100) Status "Import status [Static: 1=Pending, 2=Sent, 3=Completed, 4=Failed]"
    }
   
    ClipKeyingStatus ||--o{ Clip : "tracks keying progress | ClipKeyingStatus.Id -> Clip.KeyingStatusId"
    ClipKeyingStatus {
        int Id PK "Identity primary key"
        varchar(50) Status "Keying status [Static: 1=NotKeyed, 2=SentToDI, 3=KeyedByManual, 4=KeyedByAI, 5=Complete]"
    }
   
    KeyedDataIngestionStatus ||--o{ KeyedDataIngestion : "tracks ingestion state | KeyedDataIngestionStatus.Id -> KeyedDataIngestion.StatusId"
    KeyedDataIngestionStatus {
        int Id PK "Identity primary key"
        varchar(50) Status "Ingestion status [Static: 1=Ingesting, 2=Ingested, 3=Failed]"
    }
   
    ZipFile ||--o{ Clip : "contains clips | ZipFile.Id -> Clip.ZipFileId"
    ZipFile {
        int Id PK "Identity primary key"
        varchar(50) FileName "Zip file name"
        varchar(1000) FilePath "File storage path"
        int KeyingAgencyId FK "Target agency"
        varchar(14) ScriptDefinitionVersion "Version for backtracking"
        datetime FileZippedAt "Compression timestamp"
        int FileImportStatusId FK "Import status"
        datetime CreatedAt "Creation timestamp (default getutcdate())"
        datetime UpdatedAt "Update timestamp"
    }
                   
    ScriptData ||--o{ Clip : "generates clips | ScriptData.Id -> Clip.ScriptDataId"
    ScriptData {
        int Id PK "Identity primary key"
        uniqueidentifier ScriptGuid "Script identifier from event"
        varchar(50) OrganisationReference "Awarding body code"
        varchar(50) SessionReference "Session code"
        varchar(50) ComponentReference "Component reference"
        varchar(50) SeriesCode "Series code"
        datetime ScannedAt "Scan timestamp from event"
        datetime IngestedAt "ESP ingestion timestamp"
        varchar(30) CentreNumber "Centre number from event"
    }
   
    KeyedDataIngestion ||--o{ AutoMarkingKeyedData : "sources auto-marking data | KeyedDataIngestion.Id -> AutoMarkingKeyedData.KeyedDataIngestionId"
    KeyedDataIngestion ||--o{ NameMatchingKeyedData : "sources name-matching data | KeyedDataIngestion.Id -> NameMatchingKeyedData.KeyedDataIngestionId"
    KeyedDataIngestion {
        int Id PK "Identity primary key"
        uniqueidentifier DatasetGuid UK "Dataset identifier for all batches [UQ_DatasetGuid]"
        varchar(1000) FileName "Keyed data filename (keyedFileName)"
        int StatusId FK "Ingestion status reference"
        varchar(50) KeyingAgencyCode FK "Source keying agency code from DI [FK to KeyingAgency.AgencyCode]"
        int TotalRecordCount "Expected total records (X-Total-Record-Count)"
        datetime DataInterchangeReceivedAt "DI receipt timestamp (receivedAt)"
        datetime IngestedAt "ESP ingestion timestamp"
        datetime CreatedAt "Creation timestamp (default getutcdate())"
        datetime UpdatedAt "Update timestamp for upsert"
    }
   
    Clip ||--o{ AutoMarkingKeyedData : "has auto-marking keyed data | Clip.Id -> AutoMarkingKeyedData.ClipId"
    Clip ||--o{ NameMatchingKeyedData : "has name-matching keyed data | Clip.Id -> NameMatchingKeyedData.ClipId"
    Clip {
        int Id PK "Identity primary key"
        uniqueidentifier ClipGuid UK "Unique clip identifier for inter-domain exchanges"
        varchar(50) GeneratedClipIdentifier UK "Generated identifier - matches ClipIdentifier from DI [UX_Clip_GeneratedClipIdentifier]"
        int ClipTypeId FK "Clip type reference (determines KA routing)"
        int ZipFileId FK "Source zip file"
        varchar(30) Name "Name from ClipDefinition"
        int ScriptDataId FK "Associated script"
        int PageNumber "Page number in script"
        int KeyingStatusId FK "Keying progress reference"
        datetime CreatedAt "Creation timestamp (default getutcdate())"
        datetime UpdatedAt "Update timestamp"
    }
   
    AutoMarkingKeyedData {
        int Id PK "Identity primary key"
        int ClipId FK "Associated clip (NULL = no match found) [IX_ClipId]"
        int KeyedDataIngestionId FK "Source ingestion record"
        varchar(255) ClipIdentifier "Clip identifier from DI - match to Clip.GeneratedClipIdentifier [IX_ClipIdentifier]"
        varchar(10) KeyedValue "Keyed value data"
        datetime CreatedAt "Creation timestamp (default getutcdate())"
    }
   
    NameMatchingKeyedData {
        int Id PK "Identity primary key"
        int ClipId FK "Associated clip (NULL = no match found) [IX_ClipId]"
        int KeyedDataIngestionId FK "Source ingestion record"
        varchar(255) ClipIdentifier "Clip identifier from DI - match to Clip.GeneratedClipIdentifier [IX_ClipIdentifier]"
        varchar(50) CandidateNumber "Candidate identifier (string from API)"
        varchar(50) CentreNumber "Centre identifier (string from API)"
        varchar(200) Forename "Candidate first name"
        varchar(200) Surname "Candidate last name"
        date DateOfBirth "Candidate DOB"
        date TestDate "Test date"
        datetime CreatedAt "Creation timestamp (default getutcdate())"
    }
```

```mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Awesome!]
    B -->|No| D[Debug it]
    D --> B
    C --> E[End]
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant Extension
    participant Mermaid
    User->>Extension: Open Preview
    Extension->>Mermaid: Render Diagram
    Mermaid-->>Extension: SVG Output
    Extension-->>User: Display Preview
```

## Entity Relationship Diagram

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
        string name
        string email
        int id
    }
    ORDER {
        int orderNumber
        date orderDate
        int customerId
    }
    LINE-ITEM {
        int quantity
        decimal price
    }
```

## Class Diagram

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Start
    Processing --> Success: Complete
    Processing --> Failed: Error
    Success --> [*]
    Failed --> Idle: Retry
```

## Gantt Chart

```mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Planning
    Requirements :a1, 2024-01-01, 7d
    Design      :a2, after a1, 5d
    section Development
    Coding      :a3, after a2, 14d
    Testing     :a4, after a3, 7d
    section Deployment
    Release     :a5, after a4, 3d
```

## Instructions

1. Open this file in VSCode
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Mermaid: Open Preview to the Side"
4. Try changing themes in the preview toolbar!
5. Edit any diagram and watch it update live!
