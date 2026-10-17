from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("places/suggest/", views.suggest_places, name="suggest-places"),
    path("trips/", views.create_trip, name="create-trip"),
    path("trips/<str:trip_id>/", views.trip_detail, name="trip-detail"),
    path("trips/<str:trip_id>/heatmap/", views.trip_heatmap, name="trip-heatmap"),
]
