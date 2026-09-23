# Keep Retrofit data models
-keepclassmembers class com.lifeos.companion.model.** { *; }
-keepclassmembers class com.lifeos.companion.network.** { *; }

# Keep Room entities and DAOs
-keepclassmembers class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
