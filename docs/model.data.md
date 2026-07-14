<!-- Users model  -->

| field name        | type      | required | description                                               | unique |
| ----------------- | --------- | -------- | --------------------------------------------------------- | ------ |
| id                | UUID      | true     | unique identifier for the user (primary key)              | true   |
| user_id           | text(10)  | true     | unique identifier for the user (user seen)                | true   |
| name              | text      | true     | name of the user                                          | false  |
| email             | text      | true     | email of the user                                         | true   |
| isEmailVerified   | boolean   | true     | indicates if the user's email is verified                 | false  |
| password          | text      | true     | hashed password of the user                               | false  |
| created_at        | timestamp | true     | timestamp when the user was created                       | false  |
| updated_at        | timestamp | true     | timestamp when the user was last updated                  | false  |
| profile_image     | text      | false    | URL of the user's profile image                           | false  |
| profile_image_key | text      | false    | Key of the user's profile image in storage                | false  |
| bio               | text      | false    | short biography of the user                               | false  |
| website           | text      | false    | user's personal or professional website                   | false  |
| location          | JSON      | false    | user's location                                           | false  |
| last_login        | timestamp | false    | timestamp when the user last logged in                    | false  |
| last_logout       | timestamp | false    | timestamp when the user last logged out                   | false  |
| login_attempts    | integer   | false    | number of failed login attempts                           | false  |
| account_status    | enum      | true     | status of the user's account (active, suspended, blocked) | false  |

<!-- user activities -->

| field name  | type      | required | description                                      | unique |
| ----------- | --------- | -------- | ------------------------------------------------ | ------ |
| id          | UUID      | true     | unique identifier for the activity (primary key) | true   |
| user_id     | text(10)  | true     | unique identifier for the user (foreign key)     | false  |
| login_time  | timestamp | true     | timestamp when the user logged in                | false  |
| logout_time | timestamp | false    | timestamp when the user logged out               | false  |
| ip_address  | text      | false    | IP address of the user during login              | false  |
| device_info | JSON      | false    | information about the device used for login      | false  |
| location    | JSON      | false    | location of the user during login                | false  |
| session_id  | text      | false    | unique identifier for the session                | false  |
| status      | enum      | true     | status of the activity (success, failed)         | false  |
| created_at  | timestamp | true     | timestamp when the activity was created          | false  |
| updated_at  | timestamp | true     | timestamp when the activity was last updated     | false  |
| expiration  | timestamp | false    | timestamp when the activity expires              | false  |
